// Reads shared by the reply and email code.

/** The current state of one reply, read in a single transaction. */
export async function loadReply(env, replyId) {
  const [r, m] = await env.DB.batch([
    env.DB.prepare('SELECT id, revision, lang, created_at, updated_at, updated_by, email_status FROM replies WHERE id = ?1').bind(replyId),
    env.DB.prepare('SELECT id, name, attending FROM members WHERE reply_id = ?1 ORDER BY position').bind(replyId)
  ]);
  const row = r.results[0];
  if (!row) return null;
  return {
    id: row.id,
    revision: row.revision,
    lang: row.lang,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
    emailStatus: row.email_status,
    people: m.results.map((x) => ({ id: x.id, name: x.name, attending: x.attending === 1 }))
  };
}
