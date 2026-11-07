// Settings come from wrangler.jsonc "vars" (and secrets). Server time is authoritative.

function int(v, dflt, lo, hi) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt;
}

// '' means "no deadline set". An unreadable value counts as already closed (fail closed).
function deadline(v) {
  const s = String(v ?? '').trim();
  if (!s) return null;
  const ms = Date.parse(s);
  return Number.isFinite(ms) ? ms : -Infinity;
}

export function settings(env) {
  return {
    dev: env.ENVIRONMENT === 'development',
    siteUrl: String(env.SITE_URL || '').replace(/\/+$/, ''),
    editsCloseAt: deadline(env.EDITS_CLOSE_AT),
    firstRepliesCloseAt: deadline(env.FIRST_REPLIES_CLOSE_AT),
    maxPeople: int(env.MAX_PEOPLE, 12, 1, 50),
    sessionMinutes: int(env.SESSION_MINUTES, 30, 5, 240),
    organizerLinkDays: int(env.ORGANIZER_LINK_DAYS, 7, 1, 60),
    emailExpiryHours: int(env.EMAIL_EXPIRY_HOURS, 72, 1, 240),
    rateLimit: int(env.RATE_LIMIT, 30, 3, 10000),
    emailFrom: String(env.EMAIL_FROM || ''),
    emailReplyTo: String(env.EMAIL_REPLY_TO || '')
  };
}

export function isOpen(closeAt, now) {
  return closeAt === null || now < closeAt;
}

export function isLocalhost(request) {
  const h = new URL(request.url).hostname;
  return h === '127.0.0.1' || h === 'localhost' || h === '[::1]';
}

// Tests can pretend it is another moment (for the 17 June cutoff) with an X-Dev-Now header.
// Only honoured when ENVIRONMENT is "development" AND the request is to localhost.
export function clock(request, env) {
  if (env.ENVIRONMENT === 'development' && isLocalhost(request)) {
    const h = request.headers.get('X-Dev-Now');
    if (h) {
      const ms = Date.parse(h);
      if (Number.isFinite(ms)) return ms;
    }
  }
  return Date.now();
}

export const iso = (ms) => new Date(ms).toISOString();
