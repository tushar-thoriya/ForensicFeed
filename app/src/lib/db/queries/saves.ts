import { eq } from 'drizzle-orm'
import { getDb } from '@/lib/db/client'
import { readStatus, userSaves } from '@/lib/db/schema'

// Both mutations are idempotent: setSaved(id, false) on a missing row is a
// no-op, not an error. Same for setReadStatus(id, false). Done this way so
// the client can fire optimistic toggles without first checking server
// state — the worst case is a redundant query that touches zero rows.

export async function setSaved(paperId: string, saved: boolean): Promise<void> {
  const db = getDb()
  if (saved) {
    // ON CONFLICT DO NOTHING: a second click while the first request is
    // still in flight should not throw. The row's saved_at stays at the
    // original timestamp, which matches the "save order" intent on /saved.
    await db
      .insert(userSaves)
      .values({ paperId })
      .onConflictDoNothing({ target: userSaves.paperId })
    return
  }
  await db.delete(userSaves).where(eq(userSaves.paperId, paperId))
}

export async function setReadStatus(paperId: string, isRead: boolean): Promise<void> {
  const db = getDb()
  if (isRead) {
    // Upsert to 'read'. The enum has more values (reading/archived) but A6
    // only writes 'read'; existing rows in those states get promoted to
    // 'read' on a user click, which matches the binary UI semantics.
    await db
      .insert(readStatus)
      .values({ paperId, status: 'read' })
      .onConflictDoUpdate({
        target: readStatus.paperId,
        set: { status: 'read', updatedAt: new Date() },
      })
    return
  }
  // Unread = absence of row (default state). Cheaper than carrying an
  // explicit 'unread' row for every paper the user has glanced at.
  await db.delete(readStatus).where(eq(readStatus.paperId, paperId))
}
