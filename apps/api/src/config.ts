import 'dotenv/config';
import { z } from 'zod';

const emptyToUndefined = (v: unknown) => (v === '' ? undefined : v);

const optionalUrl = z.preprocess(emptyToUndefined, z.string().url().optional());

const optionalString = z.preprocess(emptyToUndefined, z.string().optional());

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('24h'),
  SECOPS_SALT: z.string().min(16),
  SECOPS_BYPASS_TOKEN: optionalString,
  CORS_ORIGIN: z.string().default('*'),
  RATE_LIMIT_MAX: z.coerce.number().default(100),
  RATE_LIMIT_WINDOW: z.coerce.number().default(60000),
  DEFECTDOJO_URL: optionalUrl,
  DEFECTDOJO_API_KEY: optionalString,
  DEFECTDOJO_USERNAME: optionalString,
  DEFECTDOJO_PASSWORD: optionalString,
  SONARQUBE_URL: optionalUrl,
  SONARQUBE_TOKEN: optionalString,
  ZAP_API_URL: optionalUrl,
  ZAP_API_KEY: optionalString,
  MOBSF_URL: optionalUrl,
  MOBSF_API_KEY: optionalString,
  OSV_SCANNER_PATH: optionalString,
  NUCLEI_PATH: optionalString,
  PLAYWRIGHT_ENABLED: optionalString,
  ZAP_PROXY_URL: optionalUrl,
  TRAFFIC_DYE_ENABLED: optionalString,
  SLACK_WEBHOOK_URL: optionalUrl,
  PAGERDUTY_ROUTING_KEY: optionalString,
});

export type Config = z.infer<typeof envSchema>;

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = parsed.data;
