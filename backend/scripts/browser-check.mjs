// Drives the real invitation page in headless Chrome against the local test server and saves
// screenshots to test/out/. Usage (with the test server on 8788 running):
//   node scripts/browser-check.mjs
// Needs Google Chrome. Uses a throwaway profile inside test/out/, deleted at the end.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const BASE = process.env.BASE || 'http://127.0.0.1:8788';
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const OUT = fileURLToPath(new URL('../test/out/', import.meta.url));
const PROFILE = OUT + 'chrome-profile';
const INVITE_FILE = fileURLToPath(new URL('../../invite/index.html', import.meta.url));
const ADMIN = /ADMIN_TOKEN="([^"]+)"/.exec(readFileSync(new URL('../.dev.vars', import.meta.url), 'utf8'))[1];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

mkdirSync(OUT, { recursive: true });
rmSync(PROFILE, { recursive: true, force: true });
const chrome = spawn(CHROME, ['--headless=new', '--no-first-run', '--no-default-browser-check', '--hide-scrollbars',
  '--remote-debugging-port=0', '--user-data-dir=' + PROFILE, 'about:blank'], { stdio: 'ignore' });
let port;
for (let i = 0; i < 100 && !port; i++) {
  await sleep(100);
  if (existsSync(PROFILE + '/DevToolsActivePort')) port = readFileSync(PROFILE + '/DevToolsActivePort', 'utf8').split('\n')[0];
}
const page = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0;
const pending = new Map(), problems = [];
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  if (m.method === 'Runtime.exceptionThrown') problems.push('exception: ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') problems.push('console: ' + m.params.args.map((a) => a.value ?? a.description).join(' '));
  if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error' && !/Failed to load resource|ERR_INTERNET_DISCONNECTED/.test(m.params.entry.text)) problems.push('log: ' + m.params.entry.text);
});
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable'); await send('Network.enable');

async function js(expression) {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error('page error: ' + (r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text));
  return r.result?.result?.value;
}
async function until(expression, what, ms = 8000) {
  for (let t = 0; t < ms; t += 100) {
    if (await js(expression)) return;
    await sleep(100);
  }
  throw new Error('timed out waiting for ' + what);
}
async function go(url, w = 390, h = 844, mobile = true) {
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 2, mobile });
  await send('Page.navigate', { url });
  await until('document.readyState === "complete" && !!document.getElementById("rsvpForm")', 'page load');
  await js(`window.__t = {
    click: (id) => document.getElementById(id).click(),
    type: (id, v) => { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); },
    text: (id) => (document.getElementById(id).textContent || '').trim(),
    shown: (id) => { const e = document.getElementById(id); return !!e && !e.hidden && !!e.offsetParent; }
  }; true`);
  await sleep(400);
}
async function shot(name) {
  await sleep(450);
  const r = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(OUT + name + '.png', Buffer.from(r.result.data, 'base64'));
}
async function fillAndReview(people, email) {
  for (let i = 0; i < people.length; i++) {
    if (i > 0) await js('__t.click("addPerson")');
    await js(`__t.type("pname-${i}", ${JSON.stringify(people[i][0])}); __t.click("att-${i}-${people[i][1] ? 'attending' : 'declining'}")`);
  }
  if (email) await js(`__t.type("email", ${JSON.stringify(email)})`);
  await js('__t.click("toReview")');
  await until('__t.shown("rsvpReview")', 'review view');
}
const results = [];
function check(name, ok, detail = '') {
  results.push((ok ? 'PASS ' : 'FAIL ') + name + (detail ? ' — ' + detail : ''));
}

try {
  // 1. The card now carries the venue and time; the note says this is the test version.
  await go(BASE + '/?lang=en&t=end');
  check('card shows venue and time', (await js('__t.text("cPlace") + " | " + __t.text("cDetails")')) === 'Shangri-La Singapore | 5 – 9 pm');
  await until('__t.text("placeholderNote") !== ""', 'test note');
  check('test-version note', (await js('__t.text("placeholderNote")')) === 'Test version · replies are saved only on this computer');
  await shot('1-card-en');

  // 2. A new reply with an email copy.
  const email = `browser${Date.now()}@example.com`;
  await js('__t.click("replyBtn")');
  await until('__t.shown("rsvpForm")', 'form');
  await fillAndReview([['Lim Wei Ling', true], ['Lim Jun Jie', false]], email);
  await js('__t.click("saveBtn")');
  await until('__t.shown("rsvpDone")', 'done view');
  const meta = await js('__t.text("doneMeta")');
  check('saved with a reference', /^Saved .+ \(Singapore time\) · Reference R-[0-9A-Z]{4}-[0-9A-Z]{4}$/.test(meta), meta);
  check('no preview banner once saved', !(await js('__t.shown("doneBanner")')));
  check('email copy message', (await js('__t.text("doneNext")')).startsWith('A copy with your private edit link is on its way to ' + email));
  check('email field cleared after saving', (await js('document.getElementById("email").value')) === '');
  await shot('2-saved-en');

  // 3. "Edit response" straight afterwards changes the same reply.
  await js('__t.click("editAgain")');
  await until('__t.shown("rsvpForm")', 'form again');
  check('edit title', (await js('__t.text("rsvpTitle")')) === 'Change your reply');
  await js('__t.click("att-1-attending")');
  await js('__t.click("toReview")');
  await until('__t.shown("rsvpReview")', 'review again');
  await js('__t.click("saveBtn")');
  await until('__t.shown("rsvpDone") && __t.text("doneLead").startsWith("Your changes")', 'changes saved');
  check('change saved', (await js('[...document.querySelectorAll("#doneList li")].map(li => li.className).join(",")')) === 'attending,attending');
  check('reply button now says Your reply', (await js('__t.text("replyBtn")')) === 'Your reply');
  await shot('3-changed-en');

  // 4. The emailed link opens the reply for changes, skipping the film.
  const out = await (await fetch(BASE + '/api/dev/outbox?format=json')).json();
  const mail = out.emails.find((m) => m.to_address === email);
  const link = /(http\S+#edit=[A-Za-z0-9_-]{43})/.exec(mail.text_body)[1];
  await go(link);
  await until('__t.shown("rsvpForm")', 'form from link');
  check('secret removed from the address bar', !(await js('location.href')).includes('#edit='));
  check('reply loaded from link', (await js('document.getElementById("pname-0").value + "|" + document.getElementById("pname-1").value')) === 'Lim Wei Ling|Lim Jun Jie');
  check('both attending after the change', (await js('document.getElementById("att-1-attending").checked')) === true);
  await shot('4-edit-link');

  // 5. A Chinese reply without email.
  await go(BASE + '/?lang=zh&t=end');
  await js('__t.click("replyBtn")');
  await until('__t.shown("rsvpForm")', 'zh form');
  await fillAndReview([['黄美华', true]], '');
  await js('__t.click("saveBtn")');
  await until('__t.shown("rsvpDone")', 'zh done');
  check('Chinese saved message', (await js('__t.text("doneLead")')) === '您的回复已保存：');
  check('Chinese next steps', (await js('__t.text("doneNext")')).startsWith('接下来30分钟内'));
  check('Chinese card venue', (await js('__t.text("cPlace") + " | " + __t.text("cDetails")')) === '新加坡香格里拉大酒店 | 下午5时至晚上9时');
  await shot('5-saved-zh');

  // 6. A dropped connection: the save fails clearly, then the retry saves exactly once.
  await go(BASE + '/?lang=en&t=end');
  await js('__t.click("replyBtn")');
  await until('__t.shown("rsvpForm")', 'form (offline test)');
  const unique = 'Offline Test ' + Date.now();
  await fillAndReview([[unique, true]], '');
  await send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await js('__t.click("saveBtn")');
  await until('__t.shown("saveError")', 'offline error');
  check('offline message', (await js('__t.text("saveError")')).startsWith('We couldn’t reach the server'));
  await shot('6-offline');
  await send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await js('__t.click("saveBtn")');
  await until('__t.shown("rsvpDone")', 'saved after reconnecting');
  await js('__t.click("saveBtn")');          // a stray extra tap on the hidden button does nothing harmful
  const exp = await (await fetch(BASE + '/api/admin/export', { headers: { Authorization: 'Bearer ' + ADMIN } })).json();
  check('saved exactly once', exp.replies.filter((r) => r.people.some((p) => p.name === unique)).length === 1);

  // 7. After 17 June: the link shows the reply read-only. New replies are closed.
  await send('Network.setExtraHTTPHeaders', { headers: { 'X-Dev-Now': '2027-06-18T00:00:00+08:00' } });
  await go(link);
  await until('__t.shown("rsvpNotice")', 'read-only view');
  check('read-only after cutoff', (await js('__t.text("noticeText")')).startsWith('Changes closed on 17 June 2027'));
  await shot('7-after-cutoff');
  await go(BASE + '/?lang=en&t=end');
  await js('__t.click("replyBtn")');
  await until('__t.shown("rsvpNotice")', 'closed notice');
  check('replies closed notice', (await js('__t.text("noticeTitle")')) === 'Replies have closed');
  await send('Network.setExtraHTTPHeaders', { headers: {} });

  // 8. A link that doesn't work explains itself on the language screen.
  await go(BASE + '/#edit=' + 'A'.repeat(43));
  await until('__t.text("loadStatus").startsWith("This link")', 'bad-link message');
  check('bad link message', true);
  await shot('8-bad-link');

  // 9. Wider screens still lay out the card with the new lines.
  await go(BASE + '/?lang=en&t=end', 1440, 900, false);
  await shot('9-card-desktop');
  await go(BASE + '/?lang=en&t=end', 844, 390, true);
  await shot('10-card-landscape');

  // 10. Opened from disk, the form stays a preview that sends nothing.
  await go('file://' + INVITE_FILE + '?lang=en&t=end');
  await js('__t.click("replyBtn")');
  await until('__t.shown("rsvpForm")', 'file form');
  await fillAndReview([['Disk Preview', true]], '');
  await js('__t.click("saveBtn")');
  await until('__t.shown("rsvpDone")', 'file done');
  check('preview banner from disk', (await js('__t.shown("doneBanner") && __t.text("doneBanner")')) === 'Preview only · nothing was sent or saved');

  // 11. The entrance: the doors stand behind the language screen; a language tap swings them open, the film
  //     plays on the way through, and its titles wait until the doors are through. Watch again comes back to them.
  await go(BASE + '/');
  await until('document.getElementById("door").classList.contains("ready")', 'door pictures');
  check('doors behind the language screen', await js('!document.getElementById("door").hidden && document.getElementById("film").paused'));
  await shot('11-doors');
  await js('document.querySelector("#gate [data-lang=en]").click()');
  await until('!document.getElementById("film").paused', 'film starting behind the doors', 4000);
  check('film plays as the doors open, titles wait', await js('!document.getElementById("door").hidden && +getComputedStyle(document.getElementById("introNames")).opacity === 0'));
  await shot('11-doors-opening');
  await until('document.getElementById("door").hidden', 'doors gone', 5000);
  await until('+getComputedStyle(document.getElementById("introNames")).opacity > 0.5', 'titles after the doors', 4000);
  check('titles after the doors', true);
  await js('__t.click("skipBtn")');
  await until('!document.getElementById("replayBtn").hidden', 'card after skipping');
  await js('__t.click("replayBtn")');
  check('Watch again comes back to the closed doors', await js('!document.getElementById("door").hidden && document.getElementById("film").currentTime === 0'));
  await until('!document.getElementById("film").paused', 'film after Watch again', 4000);
  check('the doors open again by themselves', true);
} catch (e) {
  results.push('FAIL ' + e.message);
  await shot('error').catch(() => {});
} finally {
  ws.close();
  chrome.kill();
  await sleep(300);
  rmSync(PROFILE, { recursive: true, force: true });
}
console.log(results.join('\n'));
if (problems.length) console.log('Page problems:\n' + problems.join('\n'));
console.log('Screenshots in ' + OUT);
process.exitCode = results.some((r) => r.startsWith('FAIL')) || problems.length ? 1 : 0;
