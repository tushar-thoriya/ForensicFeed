import { createManualIngestHandler } from '@/lib/inngest/manual-trigger'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const POST = createManualIngestHandler('ingest/arxiv.manual')
