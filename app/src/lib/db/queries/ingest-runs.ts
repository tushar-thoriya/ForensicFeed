import { createId } from '@paralleldrive/cuid2'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db/client'
import { ingestRuns } from '@/lib/db/schema'
import type { PaperSource } from '@/types/paper'

export async function startRun(source: PaperSource): Promise<string> {
  const id = createId()
  await db.insert(ingestRuns).values({
    id,
    source,
    startedAt: new Date(),
    status: 'running',
  })
  return id
}

export interface FinishRunInput {
  id: string
  status: 'success' | 'partial' | 'failed'
  papersFetched: number
  papersInserted: number
  papersUpdated: number
  errorMessage?: string | null
}

export async function finishRun(input: FinishRunInput): Promise<void> {
  const finishedAt = new Date()
  const [run] = await db
    .select({ startedAt: ingestRuns.startedAt })
    .from(ingestRuns)
    .where(eq(ingestRuns.id, input.id))
    .limit(1)

  const durationMs = run ? finishedAt.getTime() - new Date(run.startedAt).getTime() : null

  await db
    .update(ingestRuns)
    .set({
      finishedAt,
      durationMs,
      status: input.status,
      papersFetched: input.papersFetched,
      papersInserted: input.papersInserted,
      papersUpdated: input.papersUpdated,
      errorMessage: input.errorMessage ?? null,
    })
    .where(eq(ingestRuns.id, input.id))
}
