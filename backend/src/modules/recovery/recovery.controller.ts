import type { Request, Response, NextFunction } from 'express';
import type { RecoveryService } from './recovery.service.js';
import { logger } from '../../shared/logger.js';
import { config } from '../../config/index.js';

export class RecoveryController {
  constructor(private readonly recoveryService: RecoveryService) {}

  private getTenantId(req: Request): string {
    const user = (req as any).user;
    return user?.tenantId || (req as any).tenantId || (req.headers['x-tenant-id'] as string) || 'tenant_demo_001';
  }

  /** GET /api/recovery/stats */
  async getStats(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const tenantId = this.getTenantId(req);
      const stats = await this.recoveryService.getStats(tenantId);
      res.json(stats);
    } catch (err) {
      next(err);
    }
  }

  /** GET /api/recovery/sessions */
  async getSessions(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const tenantId = this.getTenantId(req);
      const data = await this.recoveryService.getSessionsWithAudit(tenantId);
      res.json(data);
    } catch (err) {
      next(err);
    }
  }

  /** GET /api/recovery/sessions/:sessionId/audit */
  async getSessionAudit(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const tenantId = this.getTenantId(req);
      const sessionId = String(req.params['sessionId'] ?? '');
      const result = await this.recoveryService.getSessionAuditDetail(tenantId, sessionId);
      if (!result) {
        res.status(404).json({ message: 'Session not found' });
        return;
      }
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/recovery/run — trigger detection + recovery session creation.
   * GAP-01 FIX: Returns full RecoveryBatchSummary with batchId, ₹ at risk, ₹ recovered, rate%.
   */
  async triggerRun(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const tenantId = this.getTenantId(req);
      logger.info('recovery_run_triggered', { tenantId });
      const batchSummary = await this.recoveryService.detectAndStartRecovery(tenantId);
      res.json({ success: true, batch: batchSummary });
    } catch (err) {
      next(err);
    }
  }

  /** POST /api/recovery/sessions/:sessionId/execute */
  async executeAction(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const tenantId = this.getTenantId(req);
      const sessionId = String(req.params['sessionId'] ?? '');
      const result = await this.recoveryService.executeRecoveryAction(sessionId, tenantId);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  /** GET /api/recovery/ptp — get all promise-to-pay records */
  async getPTPs(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const tenantId = this.getTenantId(req);
      const ptps = await this.recoveryService.getPTPs(tenantId);
      res.json(ptps);
    } catch (err) {
      next(err);
    }
  }

  /** POST /api/recovery/ptp/check — trigger broken-promise check */
  async checkBrokenPromises(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await this.recoveryService.checkBrokenPromises();
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  /** POST /api/recovery/scenarios/seed-50 — seed 50-case batch */
  async seed50Batch(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const tenantId = this.getTenantId(req);
      const result = await this.recoveryService.seed50Batch(tenantId);
      res.json({ success: true, ...result });
    } catch (err) {
      next(err);
    }
  }

  /** POST /api/recovery/reset — clear demo data (restricted to demo/dev environments and admin role) */
  async resetDemo(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (config.NODE_ENV === 'production' && !config.DEMO_MODE) {
        res.status(403).json({
          error: 'FORBIDDEN',
          message: 'Demo reset is strictly disabled in production environments without DEMO_MODE enabled.',
        });
        return;
      }
      const user = (req as any).user;
      if (user && user.role !== 'admin') {
        res.status(403).json({
          error: 'FORBIDDEN',
          message: 'Admin authorization required for demo reset.',
        });
        return;
      }
      const tenantId = this.getTenantId(req);
      const result = await this.recoveryService.resetDemo(tenantId);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  /** POST /api/recovery/scenarios/replay — replay demo act */
  async replayScenario(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const tenantId = this.getTenantId(req);
      const act = Number(req.body?.actNumber ?? 1) as 1 | 2 | 3 | 4 | 5;
      const result = await this.recoveryService.replayScenario(tenantId, act);
      res.json({ success: true, ...result });
    } catch (err) {
      next(err);
    }
  }

  /** GET /api/recovery/metrics/experiment — get holdout vs treatment incremental metrics */
  async getExperimentMetrics(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const tenantId = this.getTenantId(req);
      const metrics = await this.recoveryService.getExperimentMetrics(tenantId);
      res.json(metrics);
    } catch (err) {
      next(err);
    }
  }

  /** GET /api/recovery/sessions/:sessionId/contract — get structured RecoveryContract */
  async getSessionContract(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const tenantId = this.getTenantId(req);
      const sessionId = String(req.params['sessionId'] ?? '');
      const data = await this.recoveryService.getSessionContract(tenantId, sessionId);
      if (!data) {
        res.status(404).json({ message: 'Session not found' });
        return;
      }
      res.json(data);
    } catch (err) {
      next(err);
    }
  }

  /** POST /api/recovery/sessions/:sessionId/opt-out — customer opt-out (STOP keyword) */
  async optOutSession(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const tenantId = this.getTenantId(req);
      const sessionId = String(req.params['sessionId'] ?? '');
      const result = await this.recoveryService.optOutSession(tenantId, sessionId);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }
}
