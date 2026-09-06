import { Router, Request, Response, NextFunction } from 'express';
import type { RecoveryController } from './recovery.controller.js';

export function createRecoveryRouter(
  controller: RecoveryController,
  authMiddleware: any,
  tenantScoped: any
): Router {
  const router = Router();

  // All recovery routes require authentication and tenant scope
  router.use(authMiddleware);
  router.use(tenantScoped);

  /** GET /api/recovery/stats — aggregated recovery metrics */
  router.get('/stats', (req: Request, res: Response, next: NextFunction) => controller.getStats(req, res, next));

  /** GET /api/recovery/sessions — list all recovery sessions with recent audit */
  router.get('/sessions', (req: Request, res: Response, next: NextFunction) => controller.getSessions(req, res, next));

  /** GET /api/recovery/sessions/:sessionId/audit — session detail + full audit trail */
  router.get('/sessions/:sessionId/audit', (req: Request, res: Response, next: NextFunction) =>
    controller.getSessionAudit(req, res, next)
  );

  /** POST /api/recovery/run — detect at-risk invoices and start recovery sessions */
  router.post('/run', (req: Request, res: Response, next: NextFunction) => controller.triggerRun(req, res, next));

  /** POST /api/recovery/sessions/:sessionId/execute — execute recovery action */
  router.post('/sessions/:sessionId/execute', (req: Request, res: Response, next: NextFunction) =>
    controller.executeAction(req, res, next)
  );

  /** GET /api/recovery/ptp — list all promise-to-pay records */
  router.get('/ptp', (req: Request, res: Response, next: NextFunction) => controller.getPTPs(req, res, next));

  /** POST /api/recovery/ptp/check — check and escalate overdue broken promises */
  router.post('/ptp/check', (req: Request, res: Response, next: NextFunction) => controller.checkBrokenPromises(req, res, next));

  /** POST /api/recovery/scenarios/seed-50 — seed 50-case batch */
  router.post('/scenarios/seed-50', (req: Request, res: Response, next: NextFunction) => controller.seed50Batch(req, res, next));

  /** POST /api/recovery/scenarios/replay — replay demo act */
  router.post('/scenarios/replay', (req: Request, res: Response, next: NextFunction) => controller.replayScenario(req, res, next));

  /** POST /api/recovery/reset — clear all demo data */
  router.post('/reset', (req: Request, res: Response, next: NextFunction) => controller.resetDemo(req, res, next));

  /** GET /api/recovery/metrics/experiment — get holdout vs treatment incremental metrics */
  router.get('/metrics/experiment', (req: Request, res: Response, next: NextFunction) => controller.getExperimentMetrics(req, res, next));

  /** GET /api/recovery/sessions/:sessionId/contract — get structured RecoveryContract */
  router.get('/sessions/:sessionId/contract', (req: Request, res: Response, next: NextFunction) => controller.getSessionContract(req, res, next));

  /** POST /api/recovery/sessions/:sessionId/opt-out — customer opt-out */
  router.post('/sessions/:sessionId/opt-out', (req: Request, res: Response, next: NextFunction) => controller.optOutSession(req, res, next));

  return router;
}
