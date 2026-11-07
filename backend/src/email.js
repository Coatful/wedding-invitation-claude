// Emailed copies of a reply. Each copy carries a fresh private edit link.
// Sent through Resend when RESEND_API_KEY is set; during local testing they go to the dev outbox instead.

import { decryptText, newToken, sha256Hex } from './crypto.js';
import { iso } from './config.js';
import { loadReply } from './db.js';
import { EVENT, TIME_ZONE } from './event.js';

const BACKOFF_MINUTES = [2, 15, 60, 240, 720];
const MAX_ATTEMPTS = 8;

const COPY = {
  en: {
    subject: 'Your reply · Aloysius & Meixiang’s wedding',
    thanks: 'Thank you for replying to Aloysius & Meixiang’s wedding invitation.',
    yours: 'Your reply, saved {time} (Singapore time):',
    attend: 'Will attend',
    decline: 'Will not attend',
    change: 'You can change your reply until {until} with your private link:',
    button: 'Change my reply',
    keep: 'Please keep this link private: anyone who has it can change your reply. If you receive a newer copy, use the link in that one.',
    why: 'Your email address was used only to send this copy.',
    sign: 'Aloysius & Meixiang'
  },
  zh: {
    subject: '您的回复 · 黄胤杰与魏美翔的婚礼',
    thanks: '感谢您回复黄胤杰与魏美翔的婚礼邀请。',
    yours: '您的回复（保存于新加坡时间 {time}）：',
    attend: '出席',
    decline: '不出席',
    change: '如需修改，请在{until}前使用您的专属链接：',
    button: '修改我的回复',
    keep: '请妥善保管此链接：任何获得此链接的人都可以修改您的回复。如收到更新的副本，请使用最新邮件中的链接。',
    why: '您的邮箱仅用于发送此副本。',
    sign: '黄胤杰 与 魏美翔'
  }
};

const fmt = (s, v) => s.replace(/\{(\w+)\}/g, (m, k) => v[k]);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function savedTime(isoStr, lang) {
  try {
    return new Intl.DateTimeFormat(lang === 'zh' ? 'zh-CN' : 'en-SG', {
      timeZone: TIME_ZONE, year: 'numeric', month: lang === 'zh' ? 'long' : 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit'
    }).format(new Date(isoStr));
  } catch {
    return isoStr.slice(0, 16).replace('T', ' ') + ' UTC';
  }
}

export function renderEmail(reply, lang, link) {
  const L = COPY[lang] || COPY.en, E = EVENT[lang] || EVENT.en;
  const time = savedTime(reply.updatedAt, lang);
  const text = [
    L.thanks, '',
    E.date + ' · ' + E.time,
    E.venue + ' · ' + E.address, '',
    fmt(L.yours, { time }),
    ...reply.people.map((p) => '• ' + p.name + ' — ' + (p.attending ? L.attend : L.decline)), '',
    fmt(L.change, { until: E.editUntil }),
    link, '',
    L.keep,
    L.why, '',
    L.sign
  ].join('\n');

  const rows = reply.people.map((p) =>
    '<tr><td style="padding:6px 16px 6px 0;font-size:16px;color:#17304d">' + esc(p.name) + '</td>' +
    '<td style="padding:6px 0;font:600 14px Helvetica,Arial,sans-serif;color:' + (p.attending ? '#1f6a3a' : '#8a5a16') + '">' +
    esc(p.attending ? L.attend : L.decline) + '</td></tr>').join('');
  const small = 'font:13px/1.5 Helvetica,Arial,sans-serif;color:#4a6585';
  const html = '<!doctype html><html lang="' + (lang === 'zh' ? 'zh-Hans' : 'en') + '"><body style="margin:0;padding:24px 12px;background:#eef4fa;color:#17304d;font-family:Georgia,\'Times New Roman\',serif">' +
    '<div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #d6e2ee;border-radius:12px;padding:28px">' +
    '<p style="margin:0 0 8px;font:600 12px/1.4 Helvetica,Arial,sans-serif;letter-spacing:.16em;text-transform:uppercase;color:#557ba3">' + esc(E.couple) + '</p>' +
    '<p style="margin:0 0 16px;font-size:18px;line-height:1.5">' + esc(L.thanks) + '</p>' +
    '<p style="margin:0;font-size:15px;line-height:1.6">' + esc(E.date) + ' · ' + esc(E.time) + '<br>' + esc(E.venue) + ' · ' + esc(E.address) + '</p>' +
    '<p style="margin:22px 0 6px;font:600 14px/1.4 Helvetica,Arial,sans-serif">' + esc(fmt(L.yours, { time })) + '</p>' +
    '<table role="presentation" style="border-collapse:collapse">' + rows + '</table>' +
    '<p style="margin:22px 0 12px;font-size:15px;line-height:1.5">' + esc(fmt(L.change, { until: E.editUntil })) + '</p>' +
    '<p style="margin:0 0 10px"><a href="' + esc(link) + '" style="display:inline-block;padding:12px 22px;background:#17304d;color:#ffffff;text-decoration:none;border-radius:999px;font:600 15px Helvetica,Arial,sans-serif">' + esc(L.button) + '</a></p>' +
    '<p style="margin:0 0 18px;word-break:break-all;' + small + '">' + esc(link) + '</p>' +
    '<p style="margin:0 0 8px;' + small + '">' + esc(L.keep) + '</p>' +
    '<p style="margin:0 0 18px;' + small + '">' + esc(L.why) + '</p>' +
    '<p style="margin:0;font-size:16px">' + esc(L.sign) + '</p>' +
    '</div></body></html>';
  return { subject: L.subject, text, html };
}

/** Sends due copies. Safe to run from several places at once: each job is claimed by one runner. */
export async function processEmailJobs(env, s, { limit = 5, now = Date.now() } = {}) {
  const out = { sent: 0, retry: 0, failed: 0 };
  if (!env.EMAIL_KEY) return out;
  const claimed = await env.DB.prepare(
    `UPDATE email_jobs SET status = 'sending', attempts = attempts + 1, next_attempt_at = ?1
     WHERE id IN (SELECT id FROM email_jobs WHERE status IN ('queued', 'sending') AND next_attempt_at <= ?2
                  ORDER BY created_at LIMIT ?3)
     RETURNING id, reply_id, revision, address_enc, lang, attempts, expires_at`
  ).bind(iso(now + 10 * 60000), iso(now), limit).all();   // a claim lapses after 10 minutes if the runner dies
  for (const job of claimed.results) {
    let result;
    try {
      result = await sendOne(env, s, job, now);
    } catch (e) {
      console.error('email job', job.id, 'failed with', e && e.message);
      result = await retryLater(env, job, now, 'internal error');
    }
    out[result]++;
  }
  return out;
}

async function sendOne(env, s, job, now) {
  if (!job.address_enc || Date.parse(job.expires_at) <= now) return giveUp(env, job, 'expired');
  if (job.attempts > MAX_ATTEMPTS) return giveUp(env, job, 'too many attempts');
  let address;
  try {
    address = await decryptText(env.EMAIL_KEY, job.address_enc);
  } catch {
    return giveUp(env, job, 'could not decrypt address');
  }
  const reply = await loadReply(env, job.reply_id);
  if (!reply) return giveUp(env, job, 'reply missing');

  // A new private link for this copy. Older email links stop working once this one is delivered.
  const token = newToken(), hash = await sha256Hex(token), created = iso(now);
  await env.DB.prepare(`INSERT INTO access_tokens (hash, reply_id, kind, created_at, expires_at) VALUES (?1, ?2, 'email', ?3, NULL)`)
    .bind(hash, job.reply_id, created).run();
  const msg = renderEmail(reply, job.lang, s.siteUrl + '/#edit=' + token);
  const res = await deliver(env, s, address, msg, job, now);

  if (!res.ok) {
    await env.DB.prepare('DELETE FROM access_tokens WHERE hash = ?1').bind(hash).run();
    return res.permanent ? giveUp(env, job, res.error) : retryLater(env, job, now, res.error, res.retryAt);
  }
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM access_tokens WHERE reply_id = ?1 AND kind = 'email' AND hash != ?2 AND created_at < ?3`).bind(job.reply_id, hash, created),
    env.DB.prepare(`UPDATE email_jobs SET status = 'sent', sent_at = ?1, address_enc = NULL, last_error = NULL WHERE id = ?2`).bind(iso(now), job.id),
    env.DB.prepare(`UPDATE replies SET email_status = 'sent' WHERE id = ?1`).bind(job.reply_id)
  ]);
  return 'sent';
}

async function deliver(env, s, to, msg, job, now) {
  if (env.RESEND_API_KEY) {
    if (!s.emailFrom) return { ok: false, permanent: true, error: 'EMAIL_FROM is not set' };
    let res;
    try {
      res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + env.RESEND_API_KEY,
          'Content-Type': 'application/json',
          'Idempotency-Key': job.id + '-' + job.attempts
        },
        body: JSON.stringify({
          from: s.emailFrom, to: [to], subject: msg.subject, text: msg.text, html: msg.html,
          ...(s.emailReplyTo ? { reply_to: s.emailReplyTo } : {})
        })
      });
    } catch {
      return { ok: false, error: 'network error' };
    }
    if (res.ok) return { ok: true };
    let name = '';
    try { name = String((await res.json()).name || ''); } catch { /* not JSON */ }
    if (res.status === 429) {
      // Daily or monthly allowance used up: try again after midnight UTC. Otherwise just too fast.
      const quota = /quota/i.test(name);
      const nextDay = Math.ceil((now + 1) / 86400000) * 86400000 + Math.floor(Math.random() * 30) * 60000;
      return { ok: false, error: '429 ' + name, retryAt: quota ? nextDay : now + 90000 };
    }
    if (res.status >= 500) return { ok: false, error: 'email service ' + res.status };
    return { ok: false, permanent: true, error: 'rejected ' + res.status + ' ' + name };
  }
  if (s.dev) {
    await env.DB.prepare('INSERT INTO dev_outbox (created_at, to_address, subject, text_body, html_body) VALUES (?1, ?2, ?3, ?4, ?5)')
      .bind(iso(now), to, msg.subject, msg.text, msg.html).run();
    return { ok: true };
  }
  return { ok: false, permanent: true, error: 'no email service configured' };
}

async function retryLater(env, job, now, error, retryAt) {
  const at = retryAt || now + BACKOFF_MINUTES[Math.min(job.attempts - 1, BACKOFF_MINUTES.length - 1)] * 60000;
  if (at >= Date.parse(job.expires_at)) return giveUp(env, job, error + ' (gave up)');
  await env.DB.prepare(`UPDATE email_jobs SET status = 'queued', next_attempt_at = ?1, last_error = ?2 WHERE id = ?3`)
    .bind(iso(at), String(error).slice(0, 200), job.id).run();
  return 'retry';
}

async function giveUp(env, job, error) {
  await env.DB.batch([
    env.DB.prepare(`UPDATE email_jobs SET status = 'failed', address_enc = NULL, last_error = ?1 WHERE id = ?2`).bind(String(error).slice(0, 200), job.id),
    env.DB.prepare(`UPDATE replies SET email_status = 'failed' WHERE id = ?1`).bind(job.reply_id)
  ]);
  return 'failed';
}
