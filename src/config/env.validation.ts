import { z } from 'zod';

const port = z.coerce.number().int().min(1).max(65535);
const duration = z
  .string()
  .regex(/^\d+[smhd]$/, 'use a format like 15m, 12h, 7d');

const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  PORT: port.default(3000),
  DOMAIN: z.url(),
  CORS_ORIGINS: z.string().optional(),
  TRUST_PROXY: z.coerce.number().int().min(0).optional(),
  THROTTLE_LIMIT: z.coerce.number().int().min(1).default(100),
  THROTTLE_DISABLED: z.stringbool().default(false),

  DATABASE_URL: z
    .string()
    .regex(
      /^postgres(ql)?:\/\//,
      'must start with postgres:// or postgresql://',
    ),

  REDIS_HOST: z.string().min(1),
  REDIS_PORT: port.default(6379),
  REDIS_PASSWORD: z.string().optional(),

  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_EXPIRES_IN: duration.default('15m'),
  JWT_REFRESH_EXPIRES_IN: duration.default('7d'),

  SMTP_HOST: z.string().min(1),
  SMTP_PORT: port.default(587),
  SMTP_USERNAME: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  MAIL_FROM: z.string().min(1).optional(),
  OTP_SECRET: z.string().min(32),
  EMAIL_NOTIFICATIONS_ENABLED: z.stringbool().default(true),
  FRONTEND_URL: z.url().optional(),

  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  GOOGLE_CALLBACK_URL: z.url(),

  CLOUDINARY_CLOUD_NAME: z.string().min(1),
  CLOUDINARY_API_KEY: z.string().min(1),
  CLOUDINARY_API_SECRET: z.string().min(1),
});

type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const result = envSchema.safeParse(config);

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment variables:\n${issues}`);
  }

  return result.data;
}
