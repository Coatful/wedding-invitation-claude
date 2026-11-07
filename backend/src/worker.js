// Reply server for Aloysius & Meixiang's invitation.
//
// The invitation itself (../invite) is served as static files by Cloudflare before this code runs;
// only requests that match no file reach here. Routes:
//
//   GET  /api/status                 open/closed flags for the reply form (no database access)
//   POST /api/replies                save a new reply
//   GET  /api/replies/current        read the reply a private link belongs to   (Authorization: Bearer <link token>)
//   PUT  /api/replies/current        change it, with a revision check            (Authorization: Bearer <link token>)
//   GET  /api/admin/export           everything, for the Google Sheet            (Authorization: Bearer <ADMIN_TOKEN>)
//   POST /api/admin/edit-link        a private link for one reply, for the couple (Authorization: Bearer <ADMIN_TOKEN>)
//   POST /api/admin/process-emails   send any email copies that are due          (Authorization: Bearer <ADMIN_TOKEN>)
//   GET  /api/dev/outbox             local testing only: emails that would have been sent

import { clock, isLocalhost, settings } from './config.js';
import { hmacHex, safeEqual } from './crypto.js';
import { processEmailJobs } from './email.js';
import * as replies from './replies.js';
import { HttpError } from './validate.js';

const SECURITY_HEADERS = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer'
};

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...SECURITY_HEADERS }
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) {
      return new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8', ...SECURITY_HEADERS } });
    }
    const s = settings(env), now = clock(request, env);
    try {
      const out = await route(request, env, ctx, s, now, url);
      return out instanceof Response ? out : json(out.status, out.body);
    } catch (e) {
      if (e instanceof HttpError) return json(e.status, { ok: false, error: e.code, ...(e.detail ? { detail: e.detail } : {}) });
      console.error('unhandled error:', e && e.stack ? e.stack : e);   // never log request bodies: they hold guests' names
      return json(500, { ok: false, error: 'server_error' });
    }
  },

  // Only runs if a cron trigger is added in wrangler.jsonc (off by default; needs approval at setup).
  async scheduled(event, env, ctx) {
    const s = settings(env), now = Date.now();
    ctx.waitUntil((async () => {
      await processEmailJobs(env, s, { limit: 20, now });
      await env.DB.prepare('DELETE FROM rate_limits WHERE expires_at < ?1').bind(Math.floor(now / 1000)).run();
    })());
  }
};

async function route(request, env, ctx, s, now, url) {
  const p = url.pathname, m = request.method;

  if (p === '/api/status') {
    allow(m, 'GET');
    return { status: 200, body: replies.status(env, s, now) };
  }
  if (p === '/api/replies') {
    allow(m, 'POST');
    sameOrigin(request, url);
    await rateLimit(request, env, s, now);
    return replies.createReply(request, env, ctx, s, now);
  }
  if (p === '/api/replies/current') {
    allow(m, 'GET', 'PUT');
    if (m === 'PUT') sameOrigin(request, url);
    await rateLimit(request, env, s, now);
    return m === 'GET' ? replies.getCurrent(request, env, s, now) : replies.updateReply(request, env, ctx, s, now);
  }
  if (p === '/api/admin/export') {
    allow(m, 'GET');
    requireAdmin(request, env);
    return { status: 200, body: await replies.exportAll(env, now) };
  }
  if (p === '/api/admin/edit-link') {
    allow(m, 'POST');
    requireAdmin(request, env);
    return replies.organizerLink(request, env, s, now);
  }
  if (p === '/api/admin/process-emails') {
    allow(m, 'POST');
    requireAdmin(request, env);
    return { status: 200, body: { ok: true, ...(await processEmailJobs(env, s, { limit: 10, now })) } };
  }
  if (p === '/api/dev/outbox' && s.dev && isLocalhost(request)) {
    allow(m, 'GET');
    return devOutbox(env, url);
  }
  throw new HttpError(404, 'not_found');
}

function allow(method, ...ok) {
  if (!ok.includes(method)) throw new HttpError(405, 'method_not_allowed');
}

// Browsers send Origin on POST/PUT; a save posted from another website is refused.
function sameOrigin(request, url) {
  const o = request.headers.get('Origin');
  if (o && o !== url.origin) throw new HttpError(403, 'bad_origin');
}

function requireAdmin(request, env) {
  const key = env.ADMIN_TOKEN || '';
  if (key.length < 32) throw new HttpError(503, 'admin_not_configured');        // fail closed
  const m = /^Bearer (.+)$/.exec(request.headers.get('Authorization') || '');
  if (!m || !safeEqual(m[1], key)) throw new HttpError(401, 'unauthorized');
}

// At most RATE_LIMIT guest requests per IP address per 10 minutes. The address is stored only as a
// salted hash, and each row expires after 20 minutes.
async function rateLimit(request, env, s, now) {
  if (!env.HASH_SALT) throw new HttpError(503, 'not_configured');
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const key = (await hmacHex(env.HASH_SALT, ip + '|' + Math.floor(now / 600000))).slice(0, 32);
  const row = await env.DB.prepare(
    `INSERT INTO rate_limits (key, count, expires_at) VALUES (?1, 1, ?2)
     ON CONFLICT(key) DO UPDATE SET count = count + 1 RETURNING count`
  ).bind(key, Math.floor(now / 1000) + 1200).first();
  if (Math.random() < 0.02) {
    await env.DB.prepare('DELETE FROM rate_limits WHERE expires_at < ?1').bind(Math.floor(now / 1000)).run();
  }
  if (row && row.count > s.rateLimit) throw new HttpError(429, 'rate_limited');
}

// ---------- Local testing only ----------
const esc = (v) => String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function devOutbox(env, url) {
  const { results } = await env.DB.prepare(
    'SELECT id, created_at, to_address, subject, text_body FROM dev_outbox ORDER BY id DESC LIMIT 20'
  ).all();
  if (url.searchParams.get('format') === 'json') return json(200, { ok: true, emails: results });
  const items = results.map((r) => {
    const body = esc(r.text_body).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>');
    return '<article><h2>' + esc(r.subject) + '</h2><p class="meta">To ' + esc(r.to_address) + ' · ' + esc(r.created_at) +
      '</p><pre>' + body + '</pre></article>';
  }).join('') || '<p>No emails yet.</p>';
  const html = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<title>Test outbox</title><style>body{font:15px/1.5 -apple-system,system-ui,sans-serif;margin:0;padding:16px;background:#eef4fa;color:#17304d}' +
    'h1{font-size:20px;margin:0 0 4px}p.note{margin:0 0 16px;color:#4a6585}article{background:#fff;border:1px solid #d6e2ee;border-radius:10px;padding:14px 16px;margin:0 0 12px}' +
    'h2{font-size:16px;margin:0}.meta{margin:2px 0 8px;color:#4a6585;font-size:13px}pre{white-space:pre-wrap;word-break:break-word;font:14px/1.5 ui-monospace,Menlo,monospace;margin:0}</style></head>' +
    '<body><h1>Test outbox</h1><p class="note">Local testing only. These emails were not sent; this is what guests would receive. Newest first.</p>' +
    items + '</body></html>';
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', ...SECURITY_HEADERS } });
}
