import { serve } from 'inngest/next'
import { inngest } from '@/lib/inngest/client'
import { arxivFunctions } from '@/lib/inngest/ingest-arxiv'
import { huggingfaceFunctions } from '@/lib/inngest/ingest-huggingface'
import { semanticScholarFunctions } from '@/lib/inngest/ingest-semantic-scholar'

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    ...arxivFunctions,
    ...huggingfaceFunctions,
    ...semanticScholarFunctions,
  ],
})
