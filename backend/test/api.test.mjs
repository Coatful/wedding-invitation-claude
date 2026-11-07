// End-to-end tests for the reply server. Needs the local test server: `npm run test:server` in one
// terminal (it starts from an empty test database), then `npm test` in another.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const BASE = process.env.BASE || 'http://127.0.0.1:8788';
const DB_DIR = new URL('../.wrangler/test-state/v3/d1/miniflare-D1DatabaseObject/', import.meta.url);
const ADMIN = /ADMIN_TOKEN="([^"]+)"/.exec(readFileSync(new URL('../.dev.vars', import.meta.url), 'utf8'))[1];
const key = () => randomUUID();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let seq = 0;
const uniqueEmail = () => `guest${Date.now()}x${++seq}@example.com`;

async function call(method, path, { body, token, headers = {}, raw, now } = {}) {
  const h = { ...headers };
  if (body !== undefined && !raw) h['Content-Type'] = 'application/json';
  if (token) h.Authorization = 'Bearer ' + token;
  if (now) h['X-Dev-Now'] = now;
  // Each request gets its own made-up address so only the rate-limit test trips the limit.
  // (Locally the header passes through; on Cloudflare it is set by Cloudflare and can't be faked.)
  if (!h['CF-Connecting-IP']) h['CF-Connecting-IP'] = '10.' + [1, 2, 3].map(() => Math.floor(Math.random() * 250)).join('.');
  const res = await fetch(BASE + path, { method, headers: h, body: raw ?? (body !== undefined ? JSON.stringify(body) : undefined) });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  return { status: res.status, json, text, headers: res.headers };
}
const family = (over = {}) => ({
  idempotencyKey: key(), lang: 'en',
  people: [{ name: '  Tan   Ah\tKow ', attending: true }, { name: '陈美玲', attending: false }],
  ...over
});
const toBody = (reply, over = {}) => ({
  idempotencyKey: key(), lang: reply.lang, revision: reply.revision,
  people: reply.people.map((p) => ({ id: p.id, name: p.name, attending: p.attending })), ...over
});
async function emails() {
  const r = await call('GET', '/api/dev/outbox?format=json');
  assert.equal(r.status, 200);
  return r.json.emails;
}
async function emailFor(to, afterId = 0) {
  for (let i = 0; i < 60; i++) {
    const e = (await emails()).find((x) => x.to_address === to && x.id > afterId);
    if (e) return e;
    await wait(100);
  }
  throw new Error('no email arrived for ' + to);
}
const linkToken = (text) => /#edit=([A-Za-z0-9_-]{43})/.exec(text)[1];
function sql(query) {
  const file = readdirSync(DB_DIR).find((f) => f.endsWith('.sqlite'));
  const out = execFileSync('python3', ['-I', '-c',
    'import sqlite3,sys,json; c=sqlite3.connect("file:"+sys.argv[1]+"?mode=ro",uri=True); print(json.dumps(c.execute(sys.argv[2]).fetchall()))',
    new URL(file, DB_DIR).pathname, query]);
  return JSON.parse(out);
}

test('status says the form is open and gives the settings', async () => {
  const r = await call('GET', '/api/status');
  assert.equal(r.status, 200);
  assert.equal(r.json.firstRepliesOpen, true);
  assert.equal(r.json.editsOpen, true);
  assert.equal(r.json.editsCloseAt, '2027-06-17T16:00:00.000Z');
  assert.equal(r.json.maxPeople, 12);
  assert.equal(r.headers.get('cache-control'), 'no-store');
});

let saved;   // shared by the next few tests
test('a new reply is saved with tidied names, a reference and a session', async () => {
  const body = family();
  const r = await call('POST', '/api/replies', { body });
  assert.equal(r.status, 201, r.text);
  saved = { body, ...r.json };
  assert.match(r.json.reply.id, /^R-[0-9A-Z]{4}-[0-9A-Z]{4}$/);
  assert.equal(r.json.reply.revision, 1);
  assert.deepEqual(r.json.reply.people.map((p) => [p.name, p.attending]), [['Tan Ah Kow', true], ['陈美玲', false]]);
  assert.ok(r.json.reply.people.every((p) => /^M-[0-9A-Z]{4}-[0-9A-Z]{4}$/.test(p.id)));
  assert.match(r.json.session.token, /^[A-Za-z0-9_-]{43}$/);
  assert.deepEqual(r.json.email, { requested: false, status: 'none' });
});

test('the same save sent twice returns the same reply, not a duplicate', async () => {
  const r = await call('POST', '/api/replies', { body: saved.body });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.replayed, true);
  assert.equal(r.json.reply.id, saved.reply.id);
  assert.notEqual(r.json.session.token, saved.session.token);
  const both = await Promise.all([1, 2].map(() => call('POST', '/api/replies', { body: { ...saved.body, idempotencyKey: 'twice-at-once-' + saved.reply.id } })));
  assert.deepEqual(both.map((x) => x.status).sort(), [200, 201]);
  assert.equal(both[0].json.reply.id, both[1].json.reply.id);
});

test('reusing a save key for different answers is refused', async () => {
  const r = await call('POST', '/api/replies', { body: { ...saved.body, lang: 'zh' } });
  assert.equal(r.status, 409);
  assert.equal(r.json.error, 'idempotency_key_reused');
});

test('bad requests are refused with a reason', async () => {
  const long = 'x'.repeat(81), thirteen = Array.from({ length: 13 }, (_, i) => ({ name: 'P' + i, attending: true }));
  const cases = [
    [family({ people: [] }), 400, 'invalid'],
    [family({ people: thirteen }), 400, 'too_many_people'],
    [family({ people: [{ name: '   ', attending: true }] }), 400, 'invalid'],
    [family({ people: [{ name: '‮​', attending: true }] }), 400, 'invalid'],
    [family({ people: [{ name: long, attending: true }] }), 400, 'invalid'],
    [family({ people: [{ name: 'Ann', attending: 'yes' }] }), 400, 'invalid'],
    [family({ email: 'not-an-email' }), 400, 'invalid'],
    [family({ email: 'a@b' }), 400, 'invalid'],
    [family({ website: 'http://spam.example' }), 400, 'invalid'],
    [family({ lang: 'fr' }), 400, 'invalid'],
    [family({ idempotencyKey: 'short' }), 400, 'invalid']
  ];
  for (const [body, status, error] of cases) {
    const r = await call('POST', '/api/replies', { body });
    assert.equal(r.status, status, JSON.stringify(body).slice(0, 80) + ' → ' + r.text);
    assert.equal(r.json.error, error);
  }
  assert.equal((await call('POST', '/api/replies', { raw: '{"a":1}', headers: { 'Content-Type': 'text/plain' } })).status, 415);
  assert.equal((await call('POST', '/api/replies', { raw: '{oops', headers: { 'Content-Type': 'application/json' } })).json.error, 'invalid_json');
  const big = await call('POST', '/api/replies', { raw: JSON.stringify(family({ pad: 'x'.repeat(20000) })), headers: { 'Content-Type': 'application/json' } });
  assert.equal(big.status, 413);
  assert.equal((await call('GET', '/api/replies')).status, 405);
});

test('Chinese names and emoji are counted by character (80 is the limit)', async () => {
  const r = await call('POST', '/api/replies', { body: family({ people: [{ name: '黄'.repeat(80), attending: true }, { name: '👨‍👩‍👧 Family', attending: false }] }) });
  assert.equal(r.status, 201, r.text);
  assert.equal(r.json.reply.people[1].name, '👨‍👩‍👧 Family');
});

test('saves posted from another website are refused', async () => {
  const r = await call('POST', '/api/replies', { body: family(), headers: { Origin: 'https://evil.example' } });
  assert.equal(r.status, 403);
  assert.equal(r.json.error, 'bad_origin');
  const ok = await call('POST', '/api/replies', { body: family(), headers: { Origin: BASE } });
  assert.equal(ok.status, 201);
});

let emailed;   // a reply saved with an email copy
test('an emailed copy arrives with the reply, the wedding details and a working private link', async () => {
  const to = uniqueEmail();
  const r = await call('POST', '/api/replies', { body: family({ email: to }) });
  assert.equal(r.status, 201, r.text);
  assert.deepEqual(r.json.email, { requested: true, status: 'queued' });
  const mail = await emailFor(to);
  assert.equal(mail.subject, 'Your reply · Aloysius & Meixiang’s wedding');
  for (const bit of ['Tan Ah Kow — Will attend', '陈美玲 — Will not attend', 'Saturday, 17 July 2027 · 5 – 9 pm',
    'Shangri-La Singapore · 22 Orange Grove Road', 'until 17 June 2027', BASE + '/#edit=']) {
    assert.ok(mail.text_body.includes(bit), 'email should mention ' + bit);
  }
  const token = linkToken(mail.text_body);
  const g = await call('GET', '/api/replies/current', { token });
  assert.equal(g.status, 200, g.text);
  assert.equal(g.json.reply.id, r.json.reply.id);
  assert.deepEqual(g.json.access, { kind: 'email', canEdit: true });
  assert.equal(g.json.reply.emailStatus, 'sent');
  emailed = { to, token, reply: g.json.reply, mailId: mail.id };
});

test('a Chinese reply gets its copy in Chinese', async () => {
  const to = uniqueEmail();
  const r = await call('POST', '/api/replies', { body: family({ email: to, lang: 'zh' }) });
  assert.equal(r.status, 201);
  const mail = await emailFor(to);
  assert.equal(mail.subject, '您的回复 · 黄胤杰与魏美翔的婚礼');
  assert.ok(mail.text_body.includes('陈美玲 — 不出席'));
  assert.ok(mail.text_body.includes('新加坡香格里拉大酒店'));
  assert.ok(mail.text_body.includes('2027年6月17日前'));
});

test('email addresses are stored encrypted and erased once sent; links are stored only as hashes', async () => {
  const jobs = sql("SELECT status, address_enc FROM email_jobs");
  assert.ok(jobs.length >= 2);
  assert.ok(jobs.every(([, a]) => a === null || (a.startsWith('v1.') && !a.includes('@'))), JSON.stringify(jobs));
  assert.ok(jobs.filter(([st]) => st === 'sent').every(([, a]) => a === null));
  const hashes = sql('SELECT hash FROM access_tokens');
  assert.ok(hashes.every(([h]) => /^[0-9a-f]{64}$/.test(h)));
  assert.equal(sql(`SELECT count(*) FROM access_tokens WHERE hash = '${emailed.token}'`)[0][0], 0);
});

test('a change keeps each person’s ID, and people can be removed and added', async () => {
  const before = saved.reply;
  const body = toBody(before, {
    people: [{ id: before.people[1].id, name: '陈美玲', attending: true }, { name: 'Tan Xiao Ming', attending: true }]
  });
  const r = await call('PUT', '/api/replies/current', { token: saved.session.token, body });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.reply.revision, 2);
  assert.equal(r.json.reply.people[0].id, before.people[1].id);
  assert.notEqual(r.json.reply.people[1].id, before.people[0].id);
  assert.deepEqual(r.json.reply.people.map((p) => [p.name, p.attending]), [['陈美玲', true], ['Tan Xiao Ming', true]]);
  assert.equal(r.json.reply.updatedBy, 'guest');
  saved.reply = r.json.reply;
  saved.lastChange = body;
});

test('the same change sent twice is applied once', async () => {
  const r = await call('PUT', '/api/replies/current', { token: saved.session.token, body: saved.lastChange });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.replayed, true);
  assert.equal(r.json.reply.revision, 2);
});

test('a change based on an old version is refused, and two changes at once cannot both win', async () => {
  const stale = await call('PUT', '/api/replies/current', { token: saved.session.token, body: toBody({ ...saved.reply, revision: 1 }) });
  assert.equal(stale.status, 409);
  assert.deepEqual(stale.json, { ok: false, error: 'conflict', detail: { revision: 2 } });
  const a = toBody(saved.reply, { people: [{ name: 'Version A', attending: true }] });
  const b = toBody(saved.reply, { people: [{ name: 'Version B', attending: false }, { name: 'Extra', attending: true }] });
  const [ra, rb] = await Promise.all([a, b].map((body) => call('PUT', '/api/replies/current', { token: saved.session.token, body })));
  assert.deepEqual([ra.status, rb.status].sort(), [200, 409]);
  const winner = ra.status === 200 ? ra : rb;
  const now = await call('GET', '/api/replies/current', { token: saved.session.token });
  assert.equal(now.json.reply.revision, 3);
  assert.deepEqual(now.json.reply.people, winner.json.reply.people);   // the loser left no trace
  const hist = sql(`SELECT revision FROM history WHERE reply_id = '${saved.reply.id}' ORDER BY revision`);
  assert.deepEqual(hist.flat(), [1, 2, 3]);
});

test('asking for a new copy sends one and retires the old email link', async () => {
  const r = await call('PUT', '/api/replies/current', { token: emailed.token, body: toBody(emailed.reply, { email: emailed.to }) });
  assert.equal(r.status, 200, r.text);
  assert.deepEqual(r.json.email, { requested: true, status: 'queued' });
  const mail = await emailFor(emailed.to, emailed.mailId);
  const fresh = linkToken(mail.text_body);
  assert.notEqual(fresh, emailed.token);
  await wait(200);
  assert.equal((await call('GET', '/api/replies/current', { token: emailed.token })).status, 401);
  const g = await call('GET', '/api/replies/current', { token: fresh });
  assert.equal(g.status, 200);
  emailed = { ...emailed, token: fresh, reply: g.json.reply, mailId: mail.id };
});

test('guests can change replies through 17 June 2027 (Singapore time), then only read them', async () => {
  const last = '2027-06-17T23:59:59+08:00', closed = '2027-06-18T00:00:00+08:00';
  const ok = await call('PUT', '/api/replies/current', { token: emailed.token, now: last, body: toBody(emailed.reply) });
  assert.equal(ok.status, 200, ok.text);
  const no = await call('PUT', '/api/replies/current', { token: emailed.token, now: closed, body: toBody(ok.json.reply) });
  assert.equal(no.status, 403);
  assert.equal(no.json.error, 'edits_closed');
  const view = await call('GET', '/api/replies/current', { token: emailed.token, now: closed });
  assert.equal(view.status, 200);
  assert.equal(view.json.access.canEdit, false);
  assert.equal((await call('GET', '/api/status', { now: closed })).json.editsOpen, false);
  emailed.reply = ok.json.reply;
});

test('first-time replies close at the same moment when that date is set', async () => {
  const before = await call('POST', '/api/replies', { body: family(), now: '2027-06-17T23:59:00+08:00' });
  assert.equal(before.status, 201);
  const after = await call('POST', '/api/replies', { body: family(), now: '2027-06-18T00:00:00+08:00' });
  assert.equal(after.status, 403);
  assert.equal(after.json.error, 'replies_closed');
});

test('the “edit straight after saving” session ends after 30 minutes', async () => {
  const r = await call('POST', '/api/replies', { body: family() });
  const later = new Date(Date.now() + 31 * 60000).toISOString();
  assert.equal((await call('GET', '/api/replies/current', { token: r.json.session.token })).status, 200);
  assert.equal((await call('GET', '/api/replies/current', { token: r.json.session.token, now: later })).status, 401);
  assert.equal((await call('GET', '/api/replies/current', { token: 'A'.repeat(43) })).status, 401);
  assert.equal((await call('GET', '/api/replies/current')).status, 401);
});

test('admin routes need the admin key', async () => {
  assert.equal((await call('GET', '/api/admin/export')).status, 401);
  assert.equal((await call('GET', '/api/admin/export', { token: 'wrong'.repeat(9) })).status, 401);
  assert.equal((await call('POST', '/api/admin/edit-link', { body: { replyId: saved.reply.id } })).status, 401);
  assert.equal((await call('POST', '/api/admin/edit-link', { token: ADMIN, body: { replyId: 'nonsense' } })).status, 400);
  assert.equal((await call('POST', '/api/admin/edit-link', { token: ADMIN, body: { replyId: 'R-0000-0000' } })).status, 404);
});

test('the couple’s edit links work after 17 June and expire after 7 days', async () => {
  const made = '2027-06-30T10:00:00+08:00';
  const l = await call('POST', '/api/admin/edit-link', { token: ADMIN, now: made, body: { replyId: emailed.reply.id.toLowerCase() } });
  assert.equal(l.status, 200, l.text);
  assert.ok(l.json.url.startsWith(BASE + '/#edit='));
  const token = linkToken(l.json.url);
  const g = await call('GET', '/api/replies/current', { token, now: '2027-07-01T09:00:00+08:00' });
  assert.deepEqual(g.json.access, { kind: 'organizer', canEdit: true });
  const body = toBody(g.json.reply, { people: [{ name: 'Changed by the couple', attending: true }] });
  const r = await call('PUT', '/api/replies/current', { token, now: '2027-07-01T09:00:00+08:00', body });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.reply.updatedBy, 'organizer');
  assert.equal((await call('GET', '/api/replies/current', { token, now: '2027-07-07T10:00:01+08:00' })).status, 401);
});

test('the export has what the Sheet needs and nothing private', async () => {
  const r = await call('GET', '/api/admin/export', { token: ADMIN });
  assert.equal(r.status, 200);
  const one = r.json.replies.find((x) => x.id === saved.reply.id);
  assert.equal(one.revision, 3);
  assert.ok(Array.isArray(one.people) && one.people.length >= 1);
  assert.ok(r.json.history.some((h) => h.replyId === saved.reply.id && h.revision === 1));
  assert.ok(!r.text.includes('@example.com'), 'no email addresses');
  assert.ok(!r.text.includes(emailed.token) && !r.text.includes(saved.session.token), 'no links');
  assert.ok(!/"(hash|address|token|write_id|writeId)"/.test(r.text), 'no secrets');
});

test('the couple can send due email copies by hand', async () => {
  const r = await call('POST', '/api/admin/process-emails', { token: ADMIN });
  assert.equal(r.status, 200);
  assert.deepEqual(Object.keys(r.json).sort(), ['failed', 'ok', 'retry', 'sent']);
});

test('one address sending too many requests is slowed down', async () => {
  // A random far-future 10-minute window and made-up address, so other tests (and re-runs) aren't affected
  const now = new Date(Date.UTC(2031, 0, 1) + Math.floor(Math.random() * 1e6) * 600000).toISOString();
  const codes = [];
  const headers = { 'CF-Connecting-IP': '10.255.' + Math.floor(Math.random() * 250) + '.1' };
  for (let i = 0; i < 32; i++) codes.push((await call('GET', '/api/replies/current', { now, headers })).status);
  assert.equal((await call('GET', '/api/replies/current', { now, headers: { 'CF-Connecting-IP': '10.255.0.2' } })).status, 401);
  assert.deepEqual(codes.slice(0, 30), Array(30).fill(401));
  assert.deepEqual(codes.slice(30), [429, 429]);
});

test('the test outbox and test clock only exist on this computer', async () => {
  const out = await call('GET', '/api/dev/outbox');
  assert.equal(out.status, 200);
  assert.ok(out.headers.get('content-type').startsWith('text/html'));
  assert.ok(!out.text.includes('<script'));
  // ENVIRONMENT=production turns both off; test/units.test.mjs checks that without a server.
});
