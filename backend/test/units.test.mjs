// Checks that need no server: the safety switches and the email template.
import test from 'node:test';
import assert from 'node:assert/strict';
import { clock, isOpen, settings } from '../src/config.js';
import { renderEmail } from '../src/email.js';
import worker, { sliceStream } from '../src/worker.js';

const req = (url, headers = {}) => new Request(url, { headers });
const ctx = { waitUntil() {} };

test('the test clock is ignored in production and away from localhost', () => {
  const h = { 'X-Dev-Now': '2030-01-01T00:00:00Z' }, fake = Date.parse('2030-01-01T00:00:00Z');
  assert.equal(clock(req('http://127.0.0.1:8787/api/status', h), { ENVIRONMENT: 'development' }), fake);
  assert.notEqual(clock(req('http://127.0.0.1:8787/api/status', h), { ENVIRONMENT: 'production' }), fake);
  assert.notEqual(clock(req('https://invite.example/api/status', h), { ENVIRONMENT: 'development' }), fake);
});

test('the test outbox does not exist in production, even on localhost', async () => {
  const res = await worker.fetch(req('http://127.0.0.1:8787/api/dev/outbox'), { ENVIRONMENT: 'production' }, ctx);
  assert.equal(res.status, 404);
});

test('admin routes refuse everything when no admin key is configured', async () => {
  const res = await worker.fetch(req('http://127.0.0.1:8787/api/admin/export', { Authorization: 'Bearer anything' }), { ENVIRONMENT: 'production' }, ctx);
  assert.equal(res.status, 503);
});

test('guest saves refuse to run without the hashing secret', async () => {
  const r = new Request('http://127.0.0.1:8787/api/replies', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal((await worker.fetch(r, { ENVIRONMENT: 'production' }, ctx)).status, 503);
});

test('live without an email service, the page is told to hide the email field', async () => {
  const live = { ENVIRONMENT: 'production', EMAIL_KEY: 'x' };
  const res = await worker.fetch(req('https://invite.example/api/status'), live, ctx);
  assert.equal((await res.json()).emailCopies, false);
  const withResend = await worker.fetch(req('https://invite.example/api/status'), { ...live, RESEND_API_KEY: 'k' }, ctx);
  assert.equal((await withResend.json()).emailCopies, true);
});

test('deadlines: empty means open, unreadable means closed, 17 June is inclusive in Singapore', () => {
  assert.equal(settings({ FIRST_REPLIES_CLOSE_AT: '' }).firstRepliesCloseAt, null);
  assert.equal(isOpen(settings({ EDITS_CLOSE_AT: 'not a date' }).editsCloseAt, Date.now()), false);
  const s = settings({ EDITS_CLOSE_AT: '2027-06-18T00:00:00+08:00' });
  assert.equal(isOpen(s.editsCloseAt, Date.parse('2027-06-17T23:59:59.999+08:00')), true);
  assert.equal(isOpen(s.editsCloseAt, Date.parse('2027-06-18T00:00:00+08:00')), false);
});

test('the film is sliced to exactly the requested bytes, however it arrives in pieces', async () => {
  const data = new Uint8Array(100000).map((_, i) => (i * 7 + 3) % 251);
  const chunked = (sizes) => {
    let at = 0, k = 0;
    return new ReadableStream({
      pull(c) {
        if (at >= data.length) { c.close(); return; }
        const n = sizes[k++ % sizes.length];
        c.enqueue(data.slice(at, at + n));
        at += n;
      }
    });
  };
  const ranges = [[0, 2], [0, 100000], [999, 1000], [65535, 65537], [12345, 98765], [99999, 100000], [40000, 40001]];
  for (const sizes of [[1], [7, 13], [4096], [65536], [100000], [33333, 1]]) {
    for (const [from, to] of ranges) {
      const out = new Uint8Array(await new Response(sliceStream(chunked(sizes), from, to)).arrayBuffer());
      assert.deepEqual(out, data.slice(from, to), `pieces ${sizes} range ${from}-${to}`);
    }
  }
});

test('names in the email are escaped, so nobody can inject HTML', () => {
  const reply = {
    updatedAt: '2026-11-07T07:42:00.000Z',
    people: [{ name: '<img src=x onerror=alert(1)>', attending: true }, { name: 'Tom & "Jerry"', attending: false }]
  };
  const m = renderEmail(reply, 'en', 'https://invite.example/#edit=' + 'A'.repeat(43));
  assert.ok(!m.html.includes('<img'));
  assert.ok(m.html.includes('&lt;img src=x onerror=alert(1)&gt;'));
  assert.ok(m.html.includes('Tom &amp; &quot;Jerry&quot;'));
  assert.ok(m.text.includes('saved 7 Nov 2026, 3:42 pm'), m.text);
});
