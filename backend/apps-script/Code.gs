/**
 * Wedding replies → this Google Sheet (a private, read-only copy).
 *
 * The replies live in the reply server's database (Cloudflare D1). This script fetches them and
 * rewrites the four tabs below, every 5 minutes once switched on. It cannot change or delete a
 * reply. The one exception is "Get an edit link for the selected reply", which makes a private link
 * that you can use, or send to that family, to change their reply.
 *
 * Setup (details in backend/README.md, "The Google Sheet"):
 *   1. In the Sheet: Extensions → Apps Script. Replace Code.gs with this file. In Project Settings,
 *      tick "Show appsscript.json", then replace that file with apps-script/appsscript.json. Save.
 *   2. Reload the Sheet, then Wedding replies → Connect to the reply server… and paste the site
 *      address and the admin key. They are kept in Script Properties, which only editors can see,
 *      and never in a cell.
 *   3. Wedding replies → Refresh automatically every 5 minutes.
 */

var TZ = 'Asia/Singapore';
var TAB = {
  summary: 'Summary · 总览',
  people: 'People · 宾客',
  replies: 'Replies · 回复',
  history: 'History · 修改记录'
};
var REPLY_COL = 'Reply · 回复编号';
var ATTEND = { yes: 'Attending · 出席', no: 'Not attending · 不出席' };
var LANG = { en: 'English', zh: '中文' };
var BY = { guest: 'Guest · 宾客', organizer: 'You · 新人' };
var EMAIL = { none: '', queued: 'Sending · 发送中', sent: 'Sent · 已发送', failed: 'Failed · 发送失败' };

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Wedding replies')
    .addItem('Refresh now', 'refreshReplies')
    .addItem('Get an edit link for the selected reply', 'makeEditLink')
    .addSeparator()
    .addItem('Connect to the reply server…', 'connectServer')
    .addItem('Refresh automatically every 5 minutes', 'startAutoRefresh')
    .addItem('Stop refreshing automatically', 'stopAutoRefresh')
    .addToUi();
}

// ---------- From the server's export to rows (no Google services; tested in backend/test/sheet.test.mjs) ----------

function buildTables(data, now, formatTime) {
  var fmt = formatTime || defaultTime_;
  var replies = data.replies || [], hist = data.history || [];
  var people = [['Name · 姓名', 'Attending · 出席', REPLY_COL, 'Language · 语言', 'First replied · 首次回复',
    'Last changed · 最后修改', 'Changed by · 修改人', 'Person ID']];
  var families = [[REPLY_COL, 'People · 人数', 'Attending · 出席', 'Not attending · 不出席', 'Names · 姓名',
    'Language · 语言', 'First replied · 首次回复', 'Last changed · 最后修改', 'Changed by · 修改人', 'Version · 版本',
    'Email copy · 邮件副本']];
  var history = [['Saved · 保存时间', REPLY_COL, 'Version · 版本', 'By · 修改人', 'People · 宾客']];
  var yes = 0, no = 0, failed = 0;

  replies.forEach(function (r) {
    var y = 0, n = 0;
    r.people.forEach(function (p) {
      if (p.attending) y++; else n++;
      people.push([text_(p.name), p.attending ? ATTEND.yes : ATTEND.no, r.id, LANG[r.lang] || r.lang,
        fmt(r.createdAt), fmt(r.updatedAt), BY[r.updatedBy] || r.updatedBy, p.id]);
    });
    yes += y;
    no += n;
    if (r.emailStatus === 'failed') failed++;
    families.push([r.id, r.people.length, y, n, text_(r.people.map(function (p) { return p.name; }).join(', ')),
      LANG[r.lang] || r.lang, fmt(r.createdAt), fmt(r.updatedAt), BY[r.updatedBy] || r.updatedBy, r.revision,
      EMAIL[r.emailStatus] !== undefined ? EMAIL[r.emailStatus] : r.emailStatus]);
  });
  hist.slice().reverse().forEach(function (h) {           // newest first
    history.push([fmt(h.savedAt), h.replyId, h.revision, BY[h.savedBy] || h.savedBy,
      text_(h.people.map(function (p) { return p.name + (p.attending ? ' ✓' : ' ✗'); }).join(', '))]);
  });

  var summary = [
    ['Wedding replies · 婚礼回复', ''],
    ['People attending · 出席人数', yes],
    ['People not attending · 不出席人数', no],
    ['People in all replies · 总人数', yes + no],
    ['Replies (families) · 回复份数', replies.length],
    ['Email copies that failed · 邮件发送失败', failed],
    ['Last refreshed · 最后更新', fmt(now.toISOString()) + ' (Singapore time · 新加坡时间)'],
    ['', ''],
    ['These tabs are rebuilt on every refresh, so anything typed here is replaced. Keep notes on a tab of your own. · 这些标签页每次刷新都会重建，请在您自己的标签页记录笔记。', '']
  ];
  return { summary: summary, people: people, replies: families, history: history };
}

// Text that Sheets would run as a formula is stored as plain text instead.
function text_(s) {
  s = String(s == null ? '' : s);
  return /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
}

function defaultTime_(iso) {
  if (!iso) return '';
  var d = new Date(iso);
  if (typeof Utilities !== 'undefined') return Utilities.formatDate(d, TZ, 'yyyy-MM-dd HH:mm');
  var g = {};                                              // outside Apps Script (the tests)
  new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d).forEach(function (x) { g[x.type] = x.value; });
  return g.year + '-' + g.month + '-' + g.day + ' ' + g.hour + ':' + g.minute;
}

// ---------- Refreshing ----------

function refresh_() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return;                       // another refresh is running
  try {
    var data = callServer_('get', '/api/admin/export');
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var t = buildTables(data, new Date());
    writeTab_(ss, TAB.summary, t.summary, {});
    writeTab_(ss, TAB.people, t.people, { header: true, textCols: [1] });
    writeTab_(ss, TAB.replies, t.replies, { header: true, textCols: [5] });
    writeTab_(ss, TAB.history, t.history, { header: true, textCols: [5] });
  } catch (e) {
    noteError_(e);
    throw e;
  } finally {
    lock.releaseLock();
  }
}

function refreshReplies() {                               // menu
  try {
    refresh_();
    SpreadsheetApp.getActiveSpreadsheet().toast('Replies refreshed.');
  } catch (e) {
    SpreadsheetApp.getUi().alert('Couldn’t refresh: ' + e.message);
  }
}

function autoRefresh() {                                  // the 5-minute trigger
  refresh_();      // a failure is noted on the Summary tab; Google also emails you if it keeps failing
}

function writeTab_(ss, name, rows, opts) {
  var sh = ss.getSheetByName(name) || ss.insertSheet(name);
  var width = rows.reduce(function (m, r) { return Math.max(m, r.length); }, 1);
  var data = rows.map(function (r) { var c = r.slice(); while (c.length < width) c.push(''); return c; });
  sh.clearContents();
  (opts.textCols || []).forEach(function (c) {           // names stay exactly as typed (no dates or numbers)
    sh.getRange(1, c, data.length, 1).setNumberFormat('@');
  });
  sh.getRange(1, 1, data.length, width).setValues(data);
  if (opts.header) {
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, width).setFontWeight('bold');
  }
  var p = sh.getProtections(SpreadsheetApp.ProtectionType.SHEET)[0] || sh.protect();
  p.setDescription('Rebuilt from the reply server on every refresh');
  p.setWarningOnly(true);                                 // editing asks "are you sure?" first
}

function noteError_(e) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName(TAB.summary) || ss.insertSheet(TAB.summary);
    sh.getRange(11, 1, 1, 2).setValues([['Last refresh problem · 最近刷新出错',
      defaultTime_(new Date().toISOString()) + ' — ' + e.message]]);
  } catch (ignored) { /* nothing more to do */ }
}

// ---------- Talking to the reply server ----------

function callServer_(method, path, body) {
  var props = PropertiesService.getScriptProperties();
  var base = (props.getProperty('SERVER_URL') || '').replace(/\/+$/, '');
  var key = props.getProperty('ADMIN_KEY') || '';
  if (!base || !key) throw new Error('Not connected yet. Use Wedding replies → Connect to the reply server…');
  var options = {
    method: method,
    headers: { Authorization: 'Bearer ' + key },
    muteHttpExceptions: true,
    followRedirects: false
  };
  if (body) {
    options.contentType = 'application/json';
    options.payload = JSON.stringify(body);
  }
  var res = UrlFetchApp.fetch(base + path, options);
  var code = res.getResponseCode(), json = {};
  try { json = JSON.parse(res.getContentText()); } catch (ignored) { /* not JSON */ }
  if (code !== 200 || !json.ok) throw new Error('the reply server answered ' + code + (json.error ? ' (' + json.error + ')' : ''));
  return json;
}

function connectServer() {
  var ui = SpreadsheetApp.getUi();
  var a = ui.prompt('Connect to the reply server', 'The invitation’s address, for example https://your-domain (nothing after the domain):', ui.ButtonSet.OK_CANCEL);
  if (a.getSelectedButton() !== ui.Button.OK) return;
  var url = a.getResponseText().trim().replace(/\/+$/, '');
  if (!/^https:\/\/[^\s/]+$/.test(url)) { ui.alert('Please enter just the https:// address, with nothing after the domain.'); return; }
  var b = ui.prompt('Connect to the reply server', 'The admin key (ADMIN_TOKEN). It is kept in this script’s private settings, not in the Sheet:', ui.ButtonSet.OK_CANCEL);
  if (b.getSelectedButton() !== ui.Button.OK) return;
  var key = b.getResponseText().trim();
  if (key.length < 32) { ui.alert('That key looks too short. Please paste the whole admin key.'); return; }
  PropertiesService.getScriptProperties().setProperties({ SERVER_URL: url, ADMIN_KEY: key });
  try {
    refresh_();
    ui.alert('Connected. The tabs are up to date.');
  } catch (e) {
    ui.alert('Saved, but the first refresh failed: ' + e.message);
  }
}

function startAutoRefresh() {
  removeTriggers_();
  ScriptApp.newTrigger('autoRefresh').timeBased().everyMinutes(5).create();
  refreshReplies();
  SpreadsheetApp.getUi().alert('The tabs will now refresh every 5 minutes.');
}

function stopAutoRefresh() {
  removeTriggers_();
  SpreadsheetApp.getUi().alert('Automatic refresh is off. Use Wedding replies → Refresh now when you need it.');
}

function removeTriggers_() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'autoRefresh') ScriptApp.deleteTrigger(t);
  });
}

// ---------- A private edit link, for a guest who asked you to change their reply ----------

function makeEditLink() {
  var ui = SpreadsheetApp.getUi();
  var sh = SpreadsheetApp.getActiveSheet();
  var id = findReplyId_(sh, sh.getActiveRange().getRow());
  if (!id) { ui.alert('First click a row on the “' + TAB.people + '” or “' + TAB.replies + '” tab.'); return; }
  var go = ui.alert('Make an edit link for ' + id + '?',
    'Anyone with this link can change this reply for the next 7 days, even after 17 June. Use it yourself, or send it only to that family.',
    ui.ButtonSet.OK_CANCEL);
  if (go !== ui.Button.OK) return;
  var res;
  try {
    res = callServer_('post', '/api/admin/edit-link', { replyId: id });
  } catch (e) {
    ui.alert('Couldn’t make the link: ' + e.message);
    return;
  }
  var html = HtmlService.createHtmlOutput(
    '<div style="font:14px/1.5 Arial,sans-serif">' +
    '<p>Edit link for <b>' + esc_(res.replyId) + '</b>, valid until ' + esc_(defaultTime_(res.expiresAt)) + ' (Singapore time):</p>' +
    '<textarea readonly style="width:100%;height:64px;font:13px monospace" onclick="this.select()">' + esc_(res.url) + '</textarea>' +
    '<p style="color:#555;font-size:12px">Keep it private: whoever has it can change this reply.</p></div>'
  ).setWidth(520).setHeight(230);
  ui.showModalDialog(html, 'Edit link');
}

function findReplyId_(sh, row) {
  if (row < 2) return '';
  var header = sh.getRange(1, 1, 1, Math.max(1, sh.getLastColumn())).getValues()[0];
  var col = header.indexOf(REPLY_COL);
  if (col < 0) return '';
  var v = String(sh.getRange(row, col + 1).getValue()).trim();
  return /^R-[0-9A-Z]{4}-[0-9A-Z]{4}$/.test(v) ? v : '';
}

function esc_(s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
