import { z } from 'zod'

const emptyToUndefined = (v: unknown) => (v === '' ? undefined : v)
const optionalString = () => z.preprocess(emptyToUndefined, z.string().optional())
const optionalUrl = () => z.preprocess(emptyToUndefined, z.string().url().optional())

const serverSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().url().or(z.string().startsWith('postgres')),
  DATABASE_URL_DIRECT: z.preprocess(
    emptyToUndefined,
    z.string().url().or(z.string().startsWith('postgres')).optional(),
  ),
  SUPABASE_SERVICE_ROLE_KEY: optionalString(),

  INNGEST_EVENT_KEY: optionalString(),
  INNGEST_SIGNING_KEY: optionalString(),

  SEMANTIC_SCHOLAR_API_KEY: optionalString(),

  // Optional in dev so local manual triggers stay frictionless. Production
  // boot validation happens in lib/env-prod.ts when added in A8.
  INGEST_TRIGGER_SECRET: optionalString(),

  INGESTION_SEED_MONTHS: z.coerce.number().int().min(1).max(24).default(6),
  INGESTION_ARXIV_MAX_RESULTS: z.coerce.number().int().min(10).max(2000).default(500),

  ANTHROPIC_API_KEY: optionalString(),
  INGESTION_DAILY_LLM_TOKEN_BUDGET: z.coerce.number().int().nonnegative().default(100_000),

  RESEND_API_KEY: optionalString(),
  SENTRY_DSN: optionalString(),
})

const clientSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: optionalUrl(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: optionalString(),
  NEXT_PUBLIC_APP_URL: z
    .preprocess(emptyToUndefined, z.string().url())
    .default('http://localhost:3000'),
  NEXT_PUBLIC_SENTRY_DSN: optionalString(),
})

const processEnv = {
  NODE_ENV: process.env.NODE_ENV,
  DATABASE_URL: process.env.DATABASE_URL,
  DATABASE_URL_DIRECT: process.env.DATABASE_URL_DIRECT,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  INNGEST_EVENT_KEY: process.env.INNGEST_EVENT_KEY,
  INNGEST_SIGNING_KEY: process.env.INNGEST_SIGNING_KEY,
  SEMANTIC_SCHOLAR_API_KEY: process.env.SEMANTIC_SCHOLAR_API_KEY,
  INGEST_TRIGGER_SECRET: process.env.INGEST_TRIGGER_SECRET,
  INGESTION_SEED_MONTHS: process.env.INGESTION_SEED_MONTHS,
  INGESTION_ARXIV_MAX_RESULTS: process.env.INGESTION_ARXIV_MAX_RESULTS,
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  INGESTION_DAILY_LLM_TOKEN_BUDGET: process.env.INGESTION_DAILY_LLM_TOKEN_BUDGET,
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  SENTRY_DSN: process.env.SENTRY_DSN,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
}

const isServer = typeof window === 'undefined'

let cachedEnv: (z.infer<typeof serverSchema> & z.infer<typeof clientSchema>) | null = null

export function getEnv() {
  if (cachedEnv) return cachedEnv

  const merged = isServer
    ? { ...serverSchema.parse(processEnv), ...clientSchema.parse(processEnv) }
    : ({ ...clientSchema.parse(processEnv) } as z.infer<typeof serverSchema> &
        z.infer<typeof clientSchema>)

  cachedEnv = merged
  return merged
}

export type Env = ReturnType<typeof getEnv>
