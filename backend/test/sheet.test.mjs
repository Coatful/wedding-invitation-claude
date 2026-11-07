// Checks the Google Sheet script's table-building against a sample and against the test server's
// real export (skipped if the test server isn't running). Google's own services aren't available
// here, so only the parts that don't touch them are run.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const code = readFileSync(new URL('../apps-script/Code.gs', import.meta.url), 'utf8');
const raw = vm.runInNewContext(code + '\n;({ buildTables, text_, defaultTime_ });', {});
// Arrays made inside the sandbox have their own prototypes, so copy results out as plain JSON.
const gs = { buildTables: (...a) => JSON.parse(JSON.stringify(raw.buildTables(...a))), text_: raw.text_ };
const BASE = process.env.BASE || 'http://127.0.0.1:8788';

const sample = {
  ok: true,
  generatedAt: '2026-11-07T08:00:00.000Z',
  replies: [
    { id: 'R-AAAA-0001', revision: 2, lang: 'zh', createdAt: '2026-11-07T07:00:00.000Z', updatedAt: '2026-11-07T07:30:00.000Z',
      updatedBy: 'guest', emailStatus: 'sent',
      people: [{ id: 'M-AAAA-0001', name: '陈美玲', attending: true }, { id: 'M-AAAA-0002', name: '=HYPERLINK("http://x","click")', attending: false }] },
    { id: 'R-AAAA-0002', revision: 1, lang: 'en', createdAt: '2026-11-07T16:30:00.000Z', updatedAt: '2026-11-07T16:30:00.000Z',
      updatedBy: 'organizer', emailStatus: 'failed', people: [{ id: 'M-AAAA-0003', name: 'Tan Ah Kow', attending: true }] }
  ],
  history: [
    { replyId: 'R-AAAA-0001', revision: 1, savedAt: '2026-11-07T07:00:00.000Z', savedBy: 'guest', people: [{ name: '陈美玲', attending: false }] },
    { replyId: 'R-AAAA-0001', revision: 2, savedAt: '2026-11-07T07:30:00.000Z', savedBy: 'guest', people: [{ name: '陈美玲', attending: true }] }
  ]
};

test('one row per person, totals that add up, Singapore times', () => {
  const t = gs.buildTables(sample, new Date('2026-11-07T08:00:00Z'));
  assert.equal(t.people.length, 4);                      // header + 3 people
  assert.deepEqual(t.people[1].slice(0, 5), ['陈美玲', 'Attending · 出席', 'R-AAAA-0001', '中文', '2026-11-07 15:00']);
  assert.equal(t.people[3][4], '2026-11-08 00:30');       // 16:30 UTC is 00:30 the next day in Singapore
  assert.equal(t.people[3][6], 'You · 新人');
  const sum = Object.fromEntries(t.summary.map(([k, v]) => [k, v]));
  assert.equal(sum['People attending · 出席人数'], 2);
  assert.equal(sum['People not attending · 不出席人数'], 1);
  assert.equal(sum['Replies (families) · 回复份数'], 2);
  assert.equal(sum['Email copies that failed · 邮件发送失败'], 1);
  assert.match(sum['Last refreshed · 最后更新'], /^2026-11-07 16:00 /);
  assert.deepEqual(t.replies[1].slice(0, 4), ['R-AAAA-0001', 2, 1, 1]);
  assert.equal(t.history[1][2], 2);                        // newest first
});

test('a name that looks like a formula is stored as plain text', () => {
  const t = gs.buildTables(sample, new Date());
  assert.equal(t.people[2][0], '\'=HYPERLINK("http://x","click")');
  assert.ok(t.replies[1][4].startsWith('陈美玲, =HYPERLINK') || t.replies[1][4].startsWith('\''));
  for (const s of ['+65 1234', '-1', '@x', 'Ann']) assert.equal(gs.text_(s).startsWith("'"), s !== 'Ann');
});

test('the real export from the test server builds cleanly', async (t) => {
  let data;
  try {
    const admin = /ADMIN_TOKEN="([^"]+)"/.exec(readFileSync(new URL('../.dev.vars', import.meta.url), 'utf8'))[1];
    const res = await fetch(BASE + '/api/admin/export', { headers: { Authorization: 'Bearer ' + admin } });
    data = await res.json();
  } catch {
    t.skip('test server not running');
    return;
  }
  const tables = gs.buildTables(data, new Date());
  const people = data.replies.reduce((n, r) => n + r.people.length, 0);
  assert.equal(tables.people.length, people + 1);
  assert.equal(tables.replies.length, data.replies.length + 1);
  for (const row of [...tables.people, ...tables.replies, ...tables.history]) {
    for (const cell of row) assert.ok(!String(cell).includes('@example.com'), 'no email addresses in the Sheet');
  }
});
