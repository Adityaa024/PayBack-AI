import { Request, Response, NextFunction } from 'express';
import type { AuthService } from '../modules/auth/auth.service.js';
import type { AuthenticatedRequest } from '../shared/types/auth.js';
import { AuthError } from '../shared/errors/index.js';

export function createAuthMiddleware(authService: AuthService) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const header = req.headers.authorization;
    const isDemo = process.env.DEMO_MODE === 'true' || process.env.VITE_DEMO_MODE === 'true';

    if (!header?.startsWith('Bearer ')) {
      if (isDemo) {
        (req as AuthenticatedRequest).user = {
          userId: 'demo_admin',
          tenantId: (req.headers['x-tenant-id'] as string) || 'tenant_demo_001',
          name: 'Razorpay Judge / Demo',
          email: 'judge@razorpay.com',
          role: 'admin',
        };
        return next();
      }
      return next(new AuthError('authorization header missing or malformed', 401));
    }

    const token = header.slice(7);

    try {
      (req as AuthenticatedRequest).user = await authService.verifyAndFetchUser(token);
      next();
    } catch (err) {
      if (isDemo) {
        (req as AuthenticatedRequest).user = {
          userId: 'demo_admin',
          tenantId: (req.headers['x-tenant-id'] as string) || 'tenant_demo_001',
          name: 'Razorpay Judge / Demo',
          email: 'judge@razorpay.com',
          role: 'admin',
        };
        return next();
      }
      next(err);
    }
  };
}

