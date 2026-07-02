import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('24h'),
  SECOPS_SALT: z.string().min(16),
  SECOPS_BYPASS_TOKEN: z.string().optional(),
  CORS_ORIGIN: z.string().default('*'),
  RATE_LIMIT_MAX: z.coerce.number().default(100),
  RATE_LIMIT_WINDOW: z.coerce.number().default(60000),
  DEFECTDOJO_URL: z.string().url().optional(),
  DEFECTDOJO_API_KEY: z.string().optional(),
  DEFECTDOJO_USERNAME: z.string().optional(),
  DEFECTDOJO_PASSWORD: z.string().optional(),
  SONARQUBE_URL: z.string().url().optional(),
  SONARQUBE_TOKEN: z.string().optional(),
  ZAP_API_URL: z.string().url().optional(),
  ZAP_API_KEY: z.string().optional(),
  MOBSF_URL: z.string().url().optional(),
  MOBSF_API_KEY: z.string().optional(),
  OSV_SCANNER_PATH: z.string().optional(),
  NUCLEI_PATH: z.string().optional(),
  PLAYWRIGHT_ENABLED: z.string().optional(),
  ZAP_PROXY_URL: z.string().url().optional(),
  TRAFFIC_DYE_ENABLED: z.string().optional(),
  SLACK_WEBHOOK_URL: z.string().url().optional(),
  PAGERDUTY_ROUTING_KEY: z.string().optional(),
});

export type Config = z.infer<typeof envSchema>;

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = parsed.data;
