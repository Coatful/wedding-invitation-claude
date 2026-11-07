// Saving, reading and changing replies.
//
// Every save is one D1 batch (a single transaction). Changes use a revision check plus a random
// write_id, so a stale or duplicate save can never half-apply: every step after the first only runs
// if the first step claimed the reply with this request's own write_id.

import { HttpError, parseReplyBody, readJson, stableJson } from './validate.js';
import { encryptText, newId, newToken, sha256Hex } from './crypto.js';
import { isOpen, iso } from './config.js';
import { loadReply } from './db.js';
import { processEmailJobs } from './email.js';

const peopleJson = (people) => JSON.stringify(people.map((p) => ({ id: p.id, name: p.name, attending: p.attending })));
const asIso = (ms) => (ms === null ? null : Number.isFinite(ms) ? iso(ms) : 'invalid');

export function status(env, s, now) {
  return {
    ok: true,
    environment: s.dev ? 'development' : 'production',
    firstRepliesOpen: isOpen(s.firstRepliesCloseAt, now),
    editsOpen: isOpen(s.editsCloseAt, now),
    firstRepliesCloseAt: asIso(s.firstRepliesCloseAt),
    editsCloseAt: asIso(s.editsCloseAt),
    maxPeople: s.maxPeople,
    emailCopies: Boolean(env.EMAIL_KEY && (env.RESEND_API_KEY || s.dev))
  };
}

function findReceipt(env, key) {
  return env.DB.prepare('SELECT key, request_hash, reply_id, revision FROM receipts WHERE key = ?1').bind(key).first();
}

async function issueSession(env, s, now, replyId) {
  const token = newToken(), expiresAt = iso(now + s.sessionMinutes * 60000);
  const stmt = env.DB.prepare(`INSERT INTO access_tokens (hash, reply_id, kind, created_at, expires_at) VALUES (?1, ?2, 'session', ?3, ?4)`)
    .bind(await sha256Hex(token), replyId, iso(now), expiresAt);
  return { token, expiresAt, stmt };
}

function sendSoon(ctx, env, s, now) {
  ctx.waitUntil(processEmailJobs(env, s, { limit: 3, now }).catch((e) => console.error('email send failed:', e && e.message)));
}

// The same save sent twice (a retry after a dropped connection) gets the original outcome.
async function replay(env, s, now, receipt, requestHash, authReplyId) {
  if (receipt.request_hash !== requestHash || (authReplyId && receipt.reply_id !== authReplyId)) {
    throw new HttpError(409, 'idempotency_key_reused');
  }
  const reply = await loadReply(env, receipt.reply_id);
  const body = { ok: true, replayed: true, reply };
  if (!authReplyId) {          // a repeated first save: only the hash of the first session was kept, so issue another
    const sess = await issueSession(env, s, now, receipt.reply_id);
    await sess.stmt.run();
    body.session = { token: sess.token, expiresAt: sess.expiresAt };
  }
  return { status: 200, body };
}

export async function createReply(request, env, ctx, s, now) {
  if (!isOpen(s.firstRepliesCloseAt, now)) throw new HttpError(403, 'replies_closed');
  const input = parseReplyBody(await readJson(request), s, { forUpdate: false });
  const requestHash = await sha256Hex(stableJson({
    op: 'create', lang: input.lang, email: input.email.toLowerCase(),
    people: input.people.map((p) => [p.name, p.attending])
  }));
  const prior = await findReceipt(env, input.key);
  if (prior) return replay(env, s, now, prior, requestHash, null);

  const emailState = !input.email ? 'none' : env.EMAIL_KEY ? 'queued' : 'failed';
  const t = iso(now);
  for (let attempt = 0; attempt < 3; attempt++) {
    const replyId = newId('R');
    const people = input.people.map((p, i) => ({ id: newId('M'), name: p.name, attending: p.attending, position: i }));
    const sess = await issueSession(env, s, now, replyId);
    const stmts = [
      env.DB.prepare('INSERT INTO receipts (key, request_hash, reply_id, revision, created_at) VALUES (?1, ?2, ?3, 1, ?4)')
        .bind(input.key, requestHash, replyId, t),
      env.DB.prepare(`INSERT INTO replies (id, revision, lang, created_at, updated_at, updated_by, write_id, email_status)
                      VALUES (?1, 1, ?2, ?3, ?3, 'guest', ?4, ?5)`).bind(replyId, input.lang, t, newToken(), emailState),
      ...people.map((p) => env.DB.prepare('INSERT INTO members (id, reply_id, position, name, attending) VALUES (?1, ?2, ?3, ?4, ?5)')
        .bind(p.id, replyId, p.position, p.name, p.attending ? 1 : 0)),
      sess.stmt,
      env.DB.prepare(`INSERT INTO history (reply_id, revision, saved_at, saved_by, people_json) VALUES (?1, 1, ?2, 'guest', ?3)`)
        .bind(replyId, t, peopleJson(people))
    ];
    if (emailState === 'queued') {
      stmts.push(env.DB.prepare(`INSERT INTO email_jobs (id, reply_id, revision, address_enc, lang, status, attempts, next_attempt_at, expires_at, created_at)
                                 VALUES (?1, ?2, 1, ?3, ?4, 'queued', 0, ?5, ?6, ?5)`)
        .bind(newId('E', 3), replyId, await encryptText(env.EMAIL_KEY, input.email), input.lang, t, iso(now + s.emailExpiryHours * 3600000)));
    }
    try {
      await env.DB.batch(stmts);
    } catch (e) {
      const again = await findReceipt(env, input.key);        // the same save arrived twice at once
      if (again) return replay(env, s, now, again, requestHash, null);
      if (/UNIQUE/i.test(String(e && e.message)) && attempt < 2) continue;   // reference already taken: pick new ones
      throw e;
    }
    if (emailState === 'queued') sendSoon(ctx, env, s, now);
    return {
      status: 201,
      body: {
        ok: true,
        reply: await loadReply(env, replyId),
        session: { token: sess.token, expiresAt: sess.expiresAt },
        email: { requested: Boolean(input.email), status: emailState }
      }
    };
  }
  throw new HttpError(503, 'busy');
}

/** Finds the reply a private link belongs to. Links are 43-character secrets; only their hashes are stored. */
export async function authenticate(request, env, now) {
  const m = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(request.headers.get('Authorization') || '');
  if (!m) return null;
  const row = await env.DB.prepare('SELECT reply_id, kind, expires_at FROM access_tokens WHERE hash = ?1').bind(await sha256Hex(m[1])).first();
  if (!row) return null;
  if (row.expires_at && Date.parse(row.expires_at) <= now) return null;
  return { replyId: row.reply_id, kind: row.kind };
}

function canEdit(auth, s, now) {
  return auth.kind === 'organizer' || isOpen(s.editsCloseAt, now);    // the couple's links still work after 17 June
}

export async function getCurrent(request, env, s, now) {
  const auth = await authenticate(request, env, now);
  if (!auth) throw new HttpError(401, 'invalid_link');
  const reply = await loadReply(env, auth.replyId);
  if (!reply) throw new HttpError(401, 'invalid_link');
  return { status: 200, body: { ok: true, reply, access: { kind: auth.kind, canEdit: canEdit(auth, s, now) } } };
}

export async function updateReply(request, env, ctx, s, now) {
  const auth = await authenticate(request, env, now);
  if (!auth) throw new HttpError(401, 'invalid_link');
  if (!canEdit(auth, s, now)) throw new HttpError(403, 'edits_closed');
  const input = parseReplyBody(await readJson(request), s, { forUpdate: true });
  const requestHash = await sha256Hex(stableJson({
    op: 'update', reply: auth.replyId, revision: input.revision, lang: input.lang, email: input.email.toLowerCase(),
    people: input.people.map((p) => [p.id, p.name, p.attending])
  }));
  const prior = await findReceipt(env, input.key);
  if (prior) return replay(env, s, now, prior, requestHash, auth.replyId);

  // Keep each person's ID when they stay in the reply; new people get new IDs.
  const existing = await env.DB.prepare('SELECT id FROM members WHERE reply_id = ?1').bind(auth.replyId).all();
  const known = new Set(existing.results.map((r) => r.id)), used = new Set();
  const people = input.people.map((p, i) => {
    const id = p.id && known.has(p.id) && !used.has(p.id) ? p.id : newId('M');
    used.add(id);
    return { id, name: p.name, attending: p.attending, position: i };
  });

  const by = auth.kind === 'organizer' ? 'organizer' : 'guest';
  const wantEmail = Boolean(input.email && env.EMAIL_KEY);
  const writeId = newToken(), t = iso(now), id = auth.replyId;
  const stmts = [
    env.DB.prepare(`UPDATE replies SET revision = revision + 1, lang = ?1, updated_at = ?2, updated_by = ?3, write_id = ?4,
                      email_status = CASE WHEN ?5 = 1 THEN 'queued' ELSE email_status END
                    WHERE id = ?6 AND revision = ?7`).bind(input.lang, t, by, writeId, wantEmail ? 1 : 0, id, input.revision),
    env.DB.prepare(`DELETE FROM members WHERE reply_id = ?1 AND EXISTS (SELECT 1 FROM replies WHERE id = ?1 AND write_id = ?2)`).bind(id, writeId),
    ...people.map((p) => env.DB.prepare(`INSERT INTO members (id, reply_id, position, name, attending)
                                         SELECT ?1, ?2, ?3, ?4, ?5 WHERE EXISTS (SELECT 1 FROM replies WHERE id = ?2 AND write_id = ?6)`)
      .bind(p.id, id, p.position, p.name, p.attending ? 1 : 0, writeId)),
    env.DB.prepare(`INSERT INTO history (reply_id, revision, saved_at, saved_by, people_json)
                    SELECT id, revision, ?1, ?2, ?3 FROM replies WHERE id = ?4 AND write_id = ?5`).bind(t, by, peopleJson(people), id, writeId),
    env.DB.prepare(`INSERT INTO receipts (key, request_hash, reply_id, revision, created_at)
                    SELECT ?1, ?2, id, revision, ?3 FROM replies WHERE id = ?4 AND write_id = ?5`).bind(input.key, requestHash, t, id, writeId)
  ];
  if (wantEmail) {
    stmts.push(env.DB.prepare(`INSERT INTO email_jobs (id, reply_id, revision, address_enc, lang, status, attempts, next_attempt_at, expires_at, created_at)
                               SELECT ?1, id, revision, ?2, ?3, 'queued', 0, ?4, ?5, ?4 FROM replies WHERE id = ?6 AND write_id = ?7`)
      .bind(newId('E', 3), await encryptText(env.EMAIL_KEY, input.email), input.lang, t, iso(now + s.emailExpiryHours * 3600000), id, writeId));
  }

  let results;
  try {
    results = await env.DB.batch(stmts);
  } catch (e) {
    const again = await findReceipt(env, input.key);
    if (again) return replay(env, s, now, again, requestHash, id);
    throw e;
  }
  if (!results[0].meta.changes) {
    const again = await findReceipt(env, input.key);      // an identical retry that lost the race to itself
    if (again) return replay(env, s, now, again, requestHash, id);
    const cur = await loadReply(env, id);
    throw new HttpError(409, 'conflict', { revision: cur ? cur.revision : null });
  }
  if (wantEmail) sendSoon(ctx, env, s, now);
  return {
    status: 200,
    body: {
      ok: true,
      reply: await loadReply(env, id),
      email: { requested: Boolean(input.email), status: !input.email ? 'none' : wantEmail ? 'queued' : 'failed' }
    }
  };
}

// ---------- For the couple (called by the Google Sheet script with the admin key) ----------

/** Everything the Sheet shows. No email addresses, links or token hashes. */
export async function exportAll(env, now) {
  const [r, m, h] = await env.DB.batch([
    env.DB.prepare('SELECT id, revision, lang, created_at, updated_at, updated_by, email_status FROM replies ORDER BY created_at, id'),
    env.DB.prepare('SELECT id, reply_id, name, attending FROM members ORDER BY reply_id, position'),
    env.DB.prepare('SELECT reply_id, revision, saved_at, saved_by, people_json FROM history ORDER BY saved_at, reply_id, revision')
  ]);
  const byReply = new Map();
  for (const x of m.results) {
    if (!byReply.has(x.reply_id)) byReply.set(x.reply_id, []);
    byReply.get(x.reply_id).push({ id: x.id, name: x.name, attending: x.attending === 1 });
  }
  return {
    ok: true,
    generatedAt: iso(now),
    replies: r.results.map((x) => ({
      id: x.id, revision: x.revision, lang: x.lang, createdAt: x.created_at, updatedAt: x.updated_at,
      updatedBy: x.updated_by, emailStatus: x.email_status, people: byReply.get(x.id) || []
    })),
    history: h.results.map((x) => ({
      replyId: x.reply_id, revision: x.revision, savedAt: x.saved_at, savedBy: x.saved_by, people: JSON.parse(x.people_json)
    }))
  };
}

/** A private link for the couple to change a reply for a guest who asked (works after 17 June too). */
export async function organizerLink(request, env, s, now) {
  const body = await readJson(request, 2048);
  const id = body && typeof body.replyId === 'string' ? body.replyId.trim().toUpperCase() : '';
  if (!/^R-[0-9A-Z]{4}-[0-9A-Z]{4}$/.test(id)) throw new HttpError(400, 'invalid', { field: 'replyId' });
  if (!(await env.DB.prepare('SELECT 1 AS x FROM replies WHERE id = ?1').bind(id).first())) throw new HttpError(404, 'not_found');
  const token = newToken(), expiresAt = iso(now + s.organizerLinkDays * 86400000);
  await env.DB.prepare(`INSERT INTO access_tokens (hash, reply_id, kind, created_at, expires_at) VALUES (?1, ?2, 'organizer', ?3, ?4)`)
    .bind(await sha256Hex(token), id, iso(now), expiresAt).run();
  return { status: 200, body: { ok: true, replyId: id, url: s.siteUrl + '/#edit=' + token, expiresAt } };
}
