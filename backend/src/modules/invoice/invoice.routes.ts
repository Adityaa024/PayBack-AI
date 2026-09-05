import { Router, Request, Response, NextFunction, RequestHandler } from 'express';
import { z } from 'zod';
import { csvUpload } from '../../middleware/csv-upload.js';
import { InvoiceController } from './invoice.controller.js';
import { PaymentPlanController } from '../payment-plan/payment-plan.controller.js';
import { requireRole } from '../../middleware/require-role.js';
import { validateParam } from '../../middleware/validate-param.js';
import { ValidationError } from '../../shared/errors/index.js';

const idParamSchema = z.string().min(1).max(64).regex(/^[a-zA-Z0-9_\-\.]+$/);

export function createInvoiceRouter(
  invoiceController: InvoiceController,
  paymentPlanController: PaymentPlanController,
  authMiddleware: RequestHandler,
  tenantScoped: RequestHandler,
): Router {
  const router = Router();

  router.use(authMiddleware);
  router.use(tenantScoped);

  router.post('/', requireRole('admin', 'manager'), invoiceController.create);
  router.post('/bulk', requireRole('admin', 'manager'), invoiceController.createBulk);
  router.get('/', invoiceController.list);

  router.post(
    '/import',
    requireRole('admin', 'manager'),
    (req: Request, res: Response, next: NextFunction) => {
      csvUpload(req, res, (err: unknown) => {
        if (err) {
          next(new ValidationError('CSV upload failed', err instanceof Error ? err.message : String(err)));
          return;
        }
        next();
      });
    },
    invoiceController.importFromCsv,
  );

  // Static routes MUST come before parameterized /:id routes
  router.get('/trash', invoiceController.listTrashed);
  router.get('/payment-plans/pending', requireRole('admin', 'manager'), paymentPlanController.listPending);
  router.get('/payment-plans', requireRole('admin', 'manager'), paymentPlanController.listPlans);
  router.post('/payment-plans/:id/approve', validateParam('id', idParamSchema), requireRole('admin', 'manager'), paymentPlanController.approve);
  router.post('/payment-plans/:id/deny', validateParam('id', idParamSchema), requireRole('admin', 'manager'), paymentPlanController.deny);

  // Parameterized /:id routes
  router.get('/:id/trashed', validateParam('id', idParamSchema), invoiceController.getTrashed);
  router.get('/:id/installments', validateParam('id', idParamSchema), requireRole('admin', 'manager'), paymentPlanController.getInstallments);
  router.get('/:id/portal-link', validateParam('id', idParamSchema), requireRole('admin', 'manager'), invoiceController.getPortalLinkStatus);
  router.post('/:id/portal-link/regenerate', validateParam('id', idParamSchema), requireRole('admin', 'manager'), invoiceController.regeneratePortalLink);
  router.post('/:id/payment-link', validateParam('id', idParamSchema), requireRole('admin', 'manager'), invoiceController.generatePaymentLink);
  router.post('/:id/restore', validateParam('id', idParamSchema), requireRole('admin', 'manager'), invoiceController.restore);
  router.post('/:id/cancel-payment-plan', validateParam('id', idParamSchema), requireRole('admin', 'manager'), paymentPlanController.cancelActivePlan);
  router.patch('/:id/status', validateParam('id', idParamSchema), requireRole('admin', 'manager'), invoiceController.updateStatus);
  router.patch('/:id', validateParam('id', idParamSchema), requireRole('admin', 'manager'), invoiceController.update);
  router.delete('/:id/permanent', validateParam('id', idParamSchema), requireRole('admin'), invoiceController.permanentDelete);
  router.delete('/:id', validateParam('id', idParamSchema), requireRole('admin', 'manager'), invoiceController.delete);
  router.get('/:id', validateParam('id', idParamSchema), invoiceController.getById);

  return router;
}
