import { serve } from 'inngest/next'
import { inngest } from '@/lib/inngest/client'
import { arxivFunctions } from '@/lib/inngest/ingest-arxiv'
import { huggingfaceFunctions } from '@/lib/inngest/ingest-huggingface'
import { semanticScholarFunctions } from '@/lib/inngest/ingest-semantic-scholar'
import { cvfFunctions } from '@/lib/inngest/ingest-cvf'
import { openReviewFunctions } from '@/lib/inngest/ingest-openreview'
import { greatzhFunctions } from '@/lib/inngest/ingest-greatzh'
import { digestFunctions } from '@/lib/inngest/weekly-digest'

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    ...arxivFunctions,
    ...huggingfaceFunctions,
    ...semanticScholarFunctions,
    ...cvfFunctions,
    ...openReviewFunctions,
    ...greatzhFunctions,
    ...digestFunctions,
  ],
})
