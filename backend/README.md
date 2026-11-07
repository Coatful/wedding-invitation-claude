# Reply server: Aloysius & Meixiang's invitation

This folder stores replies for the invitation in `../invite`. It has three parts:

- **A Cloudflare Worker with a D1 database.** It saves each reply, and it also serves the invitation.
- **A private Google Sheet.** It is a read-only copy that a small script inside the Sheet refreshes every 5 minutes.
- **Optional email copies.** These go out through Resend, from an address on your domain.

**Status: built and tested on this Mac only.** Nothing is deployed. No Cloudflare, Resend or Google account is connected, no domain has been bought and no Sheet is shared. Everything in "Going live" below needs your OK first.

## How a reply flows

1. **Saving a reply.**
   - The guest taps **Save response**.
   - The server re-checks everything, then saves the whole family in one transaction: the reply, one row per person, a history entry, and a receipt so that a retried save isn't counted twice.
   - Only after that does the page say "saved". It also shows the time and a reference such as `R-7K2M-9QXA`.
2. **Email copy (optional).**
   - If the guest gave an email address, it is stored encrypted until the copy is sent, then erased.
   - The copy lists the reply, the wedding details and a private edit link.
   - If sending keeps failing for 72 hours, the server gives up and erases the address.
3. **Changing a reply.** There are three ways:
   - **Edit response** straight after saving. This works for 30 minutes and covers guests without email.
   - **The emailed link.** It works until the end of 17 June 2027, Singapore time. After that, it shows the reply read-only.
   - **A link you make from the Sheet**, for a guest who messages you. It works for 7 days, including after 17 June.
4. **Your Sheet.** It pulls everything from the server and rebuilds four tabs:
   - **Summary · 总览:** totals.
   - **People · 宾客:** one row per person.
   - **Replies · 回复:** one row per family.
   - **History · 修改记录:** every saved version.

## What is stored, and what isn't

| Kept | Not kept |
|---|---|
| Each person's name and attending / not attending | Phone numbers or addresses (never asked) |
| The reply's language, times, version and who last changed it (guest or you) | Email addresses after the copy is sent (or 72 hours after it couldn't be sent) |
| Every saved version (History) | The private links themselves: only a SHA-256 fingerprint of each |
| A fingerprint of each guest's IP address, deleted after 20 minutes, for rate limiting | Anything in logs: the server never logs names or emails |

Nothing is deleted automatically. The edit cutoff on 17 June only stops guest changes. Your data stays available through 17 July and beyond.

## Try it on this Mac

```bash
cd "Wedding Invitation/backend"
npm install          # once: installs Cloudflare's wrangler tool (4.152.0) into this folder
npm run setup        # once: makes local secrets (.dev.vars) and the local test database
npm run dev          # starts the invitation and reply server at http://127.0.0.1:8787
```

- **The invitation:** open http://127.0.0.1:8787. Replies are saved to a local database in `.wrangler/state`, and the page says "Test version".
- **Emails:** nothing is really sent. The emails guests would receive appear at http://127.0.0.1:8787/api/dev/outbox, with working edit links.
- **To start again from empty:** delete `.wrangler/state` and run `npm run setup`.
- **Without the server:** opened straight from disk, or from the plain Wi-Fi preview, the form is a preview that sends nothing.

## Tests

```bash
npm run test:server    # terminal 1: a fresh test database on port 8788
npm test               # terminal 2: 32 tests
npm run test:browser   # headless Chrome walk-through of the guest flow; screenshots go to test/out/
```

The tests cover:

- **Saving and validation:** saving, tidying names, refusing bad input, and Chinese names and emoji.
- **Duplicates and conflicts:**
  - A retried save is counted once.
  - Two changes made at the same time can't both win.
  - A change based on an old version is refused.
- **Email copies:**
  - They are in English or Chinese to match the reply.
  - Addresses are encrypted, then erased.
  - Only the newest emailed link works.
- **Deadlines:** guest changes close on 17 June, inclusive, Singapore time. Your links still work after that and expire after 7 days.
- **Admin access:** the admin key is required, and the export contains no emails or links.
- **Abuse protection:** rate limiting, the spam trap, and saves posted from other websites.
- **Test-only features:** they can't be switched on in production.
- **The Sheet's tables:** one row per person, correct totals, and names that look like formulas stored as plain text.

The browser walk-through checks the real page:

- **Save, then change:** a save, an immediate change, and opening the emailed link.
- **Chinese:** a reply made in Chinese.
- **Dropped connection:** saved exactly once after reconnecting.
- **After 17 June:** the read-only view, and "Replies have closed" when that date is set.
- **Broken link:** a message on the language screen explains it.
- **From disk:** the page still works as a preview.

## Settings (`wrangler.jsonc` → `vars`)

| Setting | Now | Meaning |
|---|---|---|
| `EDITS_CLOSE_AT` | `2027-06-18T00:00:00+08:00` | Guest changes allowed through 17 June 2027, Singapore time |
| `FIRST_REPLIES_CLOSE_AT` | empty | **Your decision.** Empty means first-time replies stay open. Set the same date to close them too. |
| `MAX_PEOPLE` | `12` | **Placeholder:** most people in one reply. Your family-size policy is still open. |
| `SESSION_MINUTES` | `30` | How long **Edit response** works after saving |
| `ORGANIZER_LINK_DAYS` | `7` | How long a link you make from the Sheet works |
| `EMAIL_EXPIRY_HOURS` | `72` | When an unsendable copy is given up and its address erased |
| `RATE_LIMIT` | `30` | Guest requests per IP address per 10 minutes |
| `ENVIRONMENT` | `development` | Set to `production` when live (turns off the test outbox and test clock) |
| `SITE_URL` | `http://127.0.0.1:8787` | Your real address when live, used in emailed links |
| `EMAIL_FROM` / `EMAIL_REPLY_TO` | empty | For example `Aloysius & Meixiang <rsvp@your-domain>`, plus where guests' replies to the email go |

The wedding details in the email are in `src/event.js`, and the card text is in `../invite/invite.js`. The time, 5 to 9 pm, is provisional, so change both together.

## Going live (each step needs your OK; none has been done)

1. **Accounts (you create them):**
   - A free Cloudflare account.
   - A free Resend account.
   - A domain. I'll show you the exact price and renewal cost before anything is bought.
2. **Connect the tool:** run `npx wrangler login`.
3. **Create the database:**
   - Run `npx wrangler d1 create wedding-replies`.
   - Copy the printed `database_id` into `wrangler.jsonc`.
   - Run `npx wrangler d1 migrations apply wedding-replies --remote`.
4. **Settings:** in `wrangler.jsonc`, set:
   - `ENVIRONMENT` to `production`
   - `SITE_URL` to `https://your-domain`
   - `EMAIL_FROM` and `EMAIL_REPLY_TO`
5. **Secrets (never in files):** run `npx wrangler secret put NAME` for each of these:
   - `ADMIN_TOKEN`: 32 random bytes.
   - `EMAIL_KEY`: 32 random bytes, base64.
   - `HASH_SALT`: 32 random bytes.
   - `RESEND_API_KEY`: a Resend key with sending access only.

   `node scripts/dev-secrets.mjs` shows how the random values are made.
6. **Email domain:** in Resend, verify your domain by adding its DNS records in Cloudflare.
7. **Publish:**
   - Run `npx wrangler deploy`.
   - Attach your domain by adding `"routes": [{ "pattern": "your-domain", "custom_domain": true }]`.
   - Then set `"workers_dev": false`, because `*.workers.dev` addresses are blocked in mainland China.
8. **The Google Sheet:** follow the section below.
9. **Check it for real:** test on an iPhone, an Android phone, WhatsApp, WeChat and, if relevant, a phone in mainland China.

**Optional, off by default:**
- **Email retries on a schedule:** uncomment the `triggers` line in `wrangler.jsonc` to retry unsent copies every 15 minutes. Without it, retries happen whenever someone saves a reply. You can also use the Sheet's server call `POST /api/admin/process-emails`.

**Backups:**
- **Restore points:** D1 keeps 7 days of them on the free plan.
- **Weekly copy:** also run `npx wrangler d1 export wedding-replies --remote --output backup-YYYY-MM-DD.sql`.
- **Sheet history:** the Sheet keeps its own version history too.

## The Google Sheet

The Sheet can only connect to the live server. Google's computers can't reach this Mac.

1. **Create the Sheet.** Make a new Google Sheet in the account that should own it. A separate wedding Gmail keeps things tidy. Share it with Meixiang as an Editor, and with no one else. Never use "anyone with the link".
2. **Add the script.**
   - Open **Extensions → Apps Script** and paste `apps-script/Code.gs` over the default `Code.gs`.
   - In **Project Settings**, tick **Show "appsscript.json" manifest file**, then paste `apps-script/appsscript.json` over it.
   - Save.
3. **Connect it.**
   - Reload the Sheet. A **Wedding replies** menu appears.
   - Choose **Connect to the reply server…** and paste `https://your-domain` and the `ADMIN_TOKEN`.
   - Google shows its "Google hasn't verified this app" screen, because this is your own private script. Choose **Advanced → Go to (project name)** and allow it.
   - The script asks only for this one spreadsheet, menus, web requests and timers. It cannot see your other files.
4. **Switch on refreshing.** Choose **Wedding replies → Refresh automatically every 5 minutes.**

**Using it:**
- **Don't type in the four tabs.** Each refresh replaces them, and editing them shows a warning. Keep notes on a tab of your own.
- **When a guest asks for a change:** click their row on **People** or **Replies**, then choose **Wedding replies → Get an edit link for the selected reply**.
- **To download:** use **File → Download → Microsoft Excel or CSV** at any time.

## Security in brief

- **No credentials in the browser.** The admin key lives only in Cloudflare secrets and the Sheet script's private properties.
- **Private links:**
  - Each is a 256-bit random secret.
  - The server stores only its fingerprint.
  - The page removes the secret from the address bar as soon as it opens.
  - The page sends no referrer.
- **Every save is re-checked on the server:**
  - Size limits and character limits.
  - Hidden control characters are removed.
  - Saves posted from other websites are refused.
  - Each IP address is rate-limited.
  - A hidden spam-trap field catches bots.
  - All database queries use prepared statements.
- **Fail closed:**
  - Admin routes refuse everything without an admin key.
  - Guest saves refuse to run without `HASH_SALT`.
  - An unreadable deadline counts as closed.
  - The test outbox and test clock work only when `ENVIRONMENT` is `development` and the address is localhost.
- **Security headers:** a strict Content-Security-Policy and other headers are set for the invitation in `../invite/_headers`.

**Not included yet:**
- **A bot challenge such as Cloudflare Turnstile.** Add it if spam ever appears.
- **Proof that a reply comes from an invited guest.** One shared link can't establish this, so you may want to watch for duplicate or unexpected names in the Sheet.

## Files

| File | What it is |
|---|---|
| `src/worker.js` | Routes, admin key check, rate limit, test outbox |
| `src/replies.js` | Saving, reading and changing replies; the export and edit links for the Sheet |
| `src/email.js` | Email copies: wording (EN/中文), sending through Resend, retries |
| `src/validate.js`, `src/config.js`, `src/crypto.js`, `src/db.js`, `src/event.js` | Checks, settings and deadlines, encryption and IDs, shared reads, wedding details |
| `migrations/0001_init.sql` | The database tables |
| `apps-script/Code.gs`, `apps-script/appsscript.json` | The Google Sheet script and its permissions |
| `test/*.test.mjs`, `scripts/browser-check.mjs` | Tests and the browser walk-through |
| `wrangler.jsonc` | Cloudflare settings (no secrets) |
| `.dev.vars` | Local test secrets only. Never share or commit it. |
