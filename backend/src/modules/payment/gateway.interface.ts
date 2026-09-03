export interface WebhookEventPayload {
  provider: string;
  invoiceId: string;
  amount: number;
  currency: string;
  status: 'captured' | 'failed' | 'other';
  externalRefId?: string;
  rawEvent: Record<string, unknown>;
  /** Populated on payment.failed events for recovery agent classification */
  failureReason?: string;
  errorCode?: string;
}

export interface IPaymentGateway {
  /**
   * Returns the canonical name of the provider (e.g., 'razorpay', 'stripe')
   */
  getProviderName(): string;

  /**
   * Verifies the webhook signature against the raw body buffer.
   */
  verifyWebhookSignature(rawBody: Buffer, signature: string, secret: string): boolean;

  /**
   * Parses the raw body into a normalized WebhookEventPayload.
   * Returns null if the event type is not supported or not actionable.
   */
  parseWebhookEvent(rawBody: Buffer): WebhookEventPayload | null;

  /**
   * Creates a payment link using the provider API.
   * Optional expiryHours for recovery links (48h urgency window).
   */
  createPaymentLink(
    credentials: Record<string, string>,
    invoiceId: string,
    amount: number,
    currency: string,
    description: string,
    expiryHours?: number
  ): Promise<{ paymentUrl: string; providerPaymentLinkId: string; providerOrderId?: string }>;

  /** Optional: cancel a stale payment link */
  cancelPaymentLink?(credentials: Record<string, string>, paymentLinkId: string): Promise<void>;

  /** Optional: retry a failed mandate/subscription */
  retrySubscription?(credentials: Record<string, string>, subscriptionId: string): Promise<{ success: boolean; message: string }>;
}

