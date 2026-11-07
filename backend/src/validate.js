// Request checks. Everything the browser sends is re-checked here.

export class HttpError extends Error {
  constructor(status, code, detail) {
    super(code);
    this.status = status;
    this.code = code;
    this.detail = detail;
  }
}

const bad = (field) => new HttpError(400, 'invalid', { field });

export async function readJson(request, limit = 16384) {
  const type = request.headers.get('Content-Type') || '';
  if (!/^application\/json\b/i.test(type)) throw new HttpError(415, 'unsupported_media_type');
  if (Number(request.headers.get('Content-Length') || 0) > limit) throw new HttpError(413, 'too_large');
  const text = await request.text();
  if (text.length > limit) throw new HttpError(413, 'too_large');
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, 'invalid_json');
  }
}

// Control characters, zero-width space, direction overrides and BOM become spaces (they can disguise names).
const HIDDEN = /[\u0000-\u001F\u007F-\u009F​‎‏‪-‮⁦-⁩﻿]/g;
export const MAX_NAME = 80;

export function cleanName(v) {
  if (typeof v !== 'string') return '';
  return v.normalize('NFC').replace(HIDDEN, ' ').replace(/\s+/g, ' ').trim();
}

const EMAIL = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:".]+$/;

/** Checks a create (forUpdate=false) or change (forUpdate=true) request body. */
export function parseReplyBody(body, s, { forUpdate }) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw bad('body');
  if (body.website) throw bad('website');                       // hidden field that only bots fill in
  const key = body.idempotencyKey;
  if (typeof key !== 'string' || !/^[A-Za-z0-9_-]{16,100}$/.test(key)) throw bad('idempotencyKey');
  if (body.lang !== 'en' && body.lang !== 'zh') throw bad('lang');
  if (!Array.isArray(body.people) || body.people.length < 1) throw bad('people');
  if (body.people.length > s.maxPeople) throw new HttpError(400, 'too_many_people', { max: s.maxPeople });

  const people = body.people.map((p, i) => {
    if (!p || typeof p !== 'object') throw bad('people.' + i);
    const name = cleanName(p.name);
    if (!name || [...name].length > MAX_NAME) throw bad('people.' + i + '.name');
    if (typeof p.attending !== 'boolean') throw bad('people.' + i + '.attending');
    const id = typeof p.id === 'string' && /^M-[0-9A-Z]{4}-[0-9A-Z]{4}$/.test(p.id) ? p.id : null;
    return { id, name, attending: p.attending };
  });

  let email = '';
  if (body.email !== undefined && body.email !== null && body.email !== '') {
    if (typeof body.email !== 'string') throw bad('email');
    email = body.email.trim();
    if (email.length > 254 || !EMAIL.test(email)) throw bad('email');
  }

  let revision = null;
  if (forUpdate) {
    revision = body.revision;
    if (!Number.isInteger(revision) || revision < 1) throw bad('revision');
  }
  return { key, lang: body.lang, people, email, revision };
}

/** JSON with sorted keys, so the same request always hashes the same way. */
export function stableJson(v) {
  if (Array.isArray(v)) return '[' + v.map(stableJson).join(',') + ']';
  if (v && typeof v === 'object') {
    return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + stableJson(v[k])).join(',') + '}';
  }
  return JSON.stringify(v ?? null);
}
