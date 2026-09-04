import { sql, eq, and, gte } from 'drizzle-orm';
import type { MerchantPolicyConfig } from './merchant-policy.service.js';
import { logger } from '../../shared/logger.js';
import { recoverySessions, invoices, communications } from '../../db/schema.js';

export interface QuietHoursCheckResult {
  inQuietHours: boolean;
  currentLocalTime: string;
  quietHoursWindow: string;
  timezone: string;
}

export interface ChannelPermissionCheckResult {
  allowed: boolean;
  reason?: string;
  resolvedChannel: string;
}

export class ResponsibleContactService {
  /**
   * Checks whether the current time in the customer's timezone falls within configured quiet hours.
   */
  public static isQuietHours(
    policy: MerchantPolicyConfig,
    customerTimezone?: string,
    now: Date = new Date()
  ): QuietHoursCheckResult {
    const tz = customerTimezone || policy.compliance.customerTimezone || 'Asia/Kolkata';

    let localHour = 0;
    let localMinute = 0;
    let timeStr = '00:00';

    try {
      const formatter = new Intl.DateTimeFormat('en-GB', {
        timeZone: tz,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
      const parts = formatter.formatToParts(now);
      localHour = parseInt(parts.find(p => p.type === 'hour')?.value || '0', 10);
      localMinute = parseInt(parts.find(p => p.type === 'minute')?.value || '0', 10);
      timeStr = `${String(localHour).padStart(2, '0')}:${String(localMinute).padStart(2, '0')}`;
    } catch {
      // Fallback if timezone is invalid
      localHour = now.getUTCHours() + 5; // approx IST
      localMinute = now.getUTCMinutes() + 30;
      if (localMinute >= 60) {
        localHour += 1;
        localMinute -= 60;
      }
      localHour = localHour % 24;
      timeStr = `${String(localHour).padStart(2, '0')}:${String(localMinute).padStart(2, '0')}`;
    }

    const [startH, startM] = policy.compliance.quietHoursStart.split(':').map(Number);
    const [endH, endM] = policy.compliance.quietHoursEnd.split(':').map(Number);

    const currentMinutes = localHour * 60 + localMinute;
    const startMinutes = startH * 60 + (startM || 0);
    const endMinutes = endH * 60 + (endM || 0);

    let inQuietHours = false;
    if (startMinutes > endMinutes) {
      // Window crosses midnight (e.g. 21:00 to 08:00)
      inQuietHours = currentMinutes >= startMinutes || currentMinutes < endMinutes;
    } else {
      // Window within same calendar day (e.g. 13:00 to 15:00)
      inQuietHours = currentMinutes >= startMinutes && currentMinutes < endMinutes;
    }

    return {
      inQuietHours,
      currentLocalTime: timeStr,
      quietHoursWindow: `${policy.compliance.quietHoursStart} - ${policy.compliance.quietHoursEnd}`,
      timezone: tz,
    };
  }

  /**
   * Validates customer consent and channel permissions against merchant policy and customer preferences.
   */
  public static validateChannel(
    policy: MerchantPolicyConfig,
    requestedChannel: string,
    customerPreferences?: {
      preferredChannel?: string;
      optedOutChannels?: string[];
      hasConsent?: boolean;
    }
  ): ChannelPermissionCheckResult {
    const allowedByPolicy = policy.compliance.allowedChannels.map(c => c.toLowerCase());
    const channelLower = requestedChannel.toLowerCase();

    // Check merchant policy
    if (!allowedByPolicy.includes(channelLower)) {
      return {
        allowed: false,
        reason: `CHANNEL_NOT_PERMITTED: Channel "${requestedChannel}" is not permitted by merchant policy (allowed: ${allowedByPolicy.join(', ')}).`,
        resolvedChannel: requestedChannel,
      };
    }

    // Check customer opt-outs
    if (customerPreferences?.optedOutChannels?.map(c => c.toLowerCase()).includes(channelLower)) {
      return {
        allowed: false,
        reason: `CUSTOMER_CHANNEL_OPT_OUT: Customer has opted out of communications via "${requestedChannel}".`,
        resolvedChannel: requestedChannel,
      };
    }

    // Check customer consent if explicitly tracked
    if (customerPreferences?.hasConsent === false) {
      return {
        allowed: false,
        reason: `NO_CUSTOMER_CONSENT: Customer has not provided active consent for outbound automated outreach.`,
        resolvedChannel: requestedChannel,
      };
    }

    return {
      allowed: true,
      resolvedChannel: customerPreferences?.preferredChannel && allowedByPolicy.includes(customerPreferences.preferredChannel.toLowerCase())
        ? customerPreferences.preferredChannel.toLowerCase()
        : channelLower,
    };
  }

  /**
   * Checks frequency/contact caps across ALL active recovery sessions for a customer in the last 24 hours.
   */
  public static async checkCustomerDailyContactCap(params: {
    tenantId: string;
    customerId: string;
    maxDailyContacts: number;
    db: any;
  }): Promise<{ allowed: boolean; currentCount: number; maxAllowed: number; reason?: string }> {
    const { tenantId, customerId, maxDailyContacts, db } = params;
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

    if (!db || typeof db.select !== 'function') {
      return { allowed: true, currentCount: 0, maxAllowed: maxDailyContacts };
    }

    try {
      // Find invoices for this customer to count communications across all sessions
      const customerInvoices = await db
        .select({ id: invoices.id })
        .from(invoices)
        .where(
          and(
            eq(invoices.tenantId, tenantId),
            sql`(${invoices.contactEmail} = ${customerId} OR ${invoices.clientName} = ${customerId})`
          )
        );

      const invoiceIds = customerInvoices.map((inv: any) => inv.id);

      if (invoiceIds.length === 0) {
        return { allowed: true, currentCount: 0, maxAllowed: maxDailyContacts };
      }

      // Count communications in past 24h
      const commRows = await db
        .select({ count: sql<number>`count(*)` })
        .from(communications)
        .where(
          and(
            eq(communications.tenantId, tenantId),
            sql`${communications.invoiceId} IN ${invoiceIds}`,
            gte(communications.createdAt, since)
          )
        );

      const count = Number(commRows[0]?.count || 0);

      if (count >= maxDailyContacts) {
        return {
          allowed: false,
          currentCount: count,
          maxAllowed: maxDailyContacts,
          reason: `DAILY_CONTACT_CAP_EXCEEDED: Customer ${customerId} has received ${count} contacts in the last 24h (cap: ${maxDailyContacts}).`,
        };
      }

      return { allowed: true, currentCount: count, maxAllowed: maxDailyContacts };
    } catch (err) {
      logger.warn('failed_to_check_customer_daily_contact_cap', { error: err });
      return { allowed: true, currentCount: 0, maxAllowed: maxDailyContacts };
    }
  }

  /**
   * Propagates STOP / opt-out keyword across ALL active and escalated sessions for the customer.
   * Future outreach across all sessions for that customer will be permanently blocked.
   */
  public static async propagateCustomerOptOut(params: {
    tenantId: string;
    customerId: string;
    reason?: string;
    db: any;
    recoveryRepo: any;
  }): Promise<{ updatedSessionsCount: number }> {
    const { tenantId, customerId, reason = 'Customer sent STOP keyword', db, recoveryRepo } = params;

    try {
      // Find all invoices for this customer
      const customerInvoices = await db
        .select({ id: invoices.id })
        .from(invoices)
        .where(
          and(
            eq(invoices.tenantId, tenantId),
            sql`(${invoices.contactEmail} = ${customerId} OR ${invoices.clientName} = ${customerId})`
          )
        );

      const invoiceIds = customerInvoices.map((inv: any) => inv.id);
      if (invoiceIds.length === 0) return { updatedSessionsCount: 0 };

      // Query active or escalated recovery sessions for these invoices
      const targetSessions = await db
        .select({ id: recoverySessions.id, invoiceId: recoverySessions.invoiceId })
        .from(recoverySessions)
        .where(
          and(
            eq(recoverySessions.tenantId, tenantId),
            sql`${recoverySessions.invoiceId} IN ${invoiceIds}`
          )
        );

      let updatedCount = 0;
      for (const session of targetSessions) {
        await db
          .update(recoverySessions)
          .set({
            optedOut: true,
            status: 'escalated',
            stopReason: 'manual_override',
            updatedAt: new Date(),
          })
          .where(eq(recoverySessions.id, session.id));

        await recoveryRepo.appendAuditLog({
          sessionId: session.id,
          tenantId,
          invoiceId: session.invoiceId,
          action: 'customer_opt_out_propagated',
          actor: 'responsible_contact_service',
          result: 'escalated',
          metadata: {
            customerId,
            reason,
            propagationScope: 'customer_cross_session',
          },
        });
        updatedCount++;
      }

      logger.info('customer_opt_out_propagated_globally', {
        customerId,
        tenantId,
        updatedSessionsCount: updatedCount,
      });

      return { updatedSessionsCount: updatedCount };
    } catch (err) {
      logger.error('failed_to_propagate_customer_opt_out', { customerId, error: err });
      return { updatedSessionsCount: 0 };
    }
  }
}
