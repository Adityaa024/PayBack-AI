import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['production', 'development', 'test']).default('production'),
  PORT: z.coerce.number().int().positive().default(3001),

  DATABASE_URL: z
    .string()
    .default('postgresql://postgres:Adianu7890@@db.jnbenaukuoohvkvnzjfw.supabase.co:5432/postgres'),

  JWT_SECRET: z
    .string()
    .default('payback-ai-jwt-secret-key-32-chars-minimum-production-secure-key'),
  JWT_EXPIRES_IN: z.string().default('7d'),

  CORS_ORIGINS: z
    .string()
    .default('https://pay-back-ai.vercel.app,http://localhost:5173')
    .transform((val) => val.split(',').map((s) => s.trim())),

  FRONTEND_URL: z.string().default('https://pay-back-ai.vercel.app'),
  PUBLIC_BASE_URL: z.string().optional(),

  INBOUND_PARSE_DOMAIN: z.string().optional(),

  AI_ML_SERVICE_URL: z
    .string()
    .optional()
    .transform((val) => {
      if (!val) return 'https://payback-ai-service.onrender.com';
      if (!val.startsWith('http://') && !val.startsWith('https://')) {
        return `https://${val}`;
      }
      return val;
    }),
  AI_ML_SERVICE_KEY: z.string().optional(),

  REDIS_URL: z.string().optional(),

  AUTH_LOCKOUT_THRESHOLD: z.coerce.number().int().positive().default(5),
  AUTH_LOCKOUT_BASE_MINUTES: z.coerce.number().int().positive().default(15),
  AUTH_LOCKOUT_MAX_MINUTES: z.coerce.number().int().positive().default(1440),
  AUTH_MFA_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),

  DISPUTE_LIMIT_PER_TENANT_HOURLY: z.coerce.number().int().positive().default(100),
  DISPUTE_LIMIT_PER_SENDER_HOURLY: z.coerce.number().int().positive().default(15),

  ALLOW_IN_MEMORY_FALLBACK: z.coerce.boolean().default(true),
  DEMO_MODE: z.coerce.boolean().default(false),

  ENCRYPTION_KEY: z
    .string()
    .default('vW9S4x6Z2a1B7c3D8e4F9g5H0j6K2m7N1p3Q8r4T9u0='),
});

function parseConfig(): z.infer<typeof schema> {
  const result = schema.safeParse(process.env);

  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }

  return result.data;
}


export const config = parseConfig();

export type Config = typeof config;
