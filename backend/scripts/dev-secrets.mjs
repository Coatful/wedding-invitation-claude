// Makes .dev.vars with random secrets for local testing (once; an existing file is left alone).
// These are for this Mac only. Live secrets are created separately with `wrangler secret put`.
import { existsSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';

const file = new URL('../.dev.vars', import.meta.url);
if (existsSync(file)) {
  console.log('.dev.vars already exists; leaving it alone.');
} else {
  const lines = [
    '# Local testing secrets. Never commit or share this file.',
    'ADMIN_TOKEN="' + randomBytes(32).toString('base64url') + '"',
    'EMAIL_KEY="' + randomBytes(32).toString('base64') + '"',
    'HASH_SALT="' + randomBytes(32).toString('base64url') + '"',
    '# RESEND_API_KEY is left out on purpose: email copies go to the test outbox instead.',
    ''
  ];
  writeFileSync(file, lines.join('\n'), { mode: 0o600 });
  console.log('Wrote .dev.vars with new random local secrets.');
}
