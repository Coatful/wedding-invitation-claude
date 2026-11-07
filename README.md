# Wedding invitation · Aloysius & Meixiang · 17 July 2027

A preview of an interactive invitation: choose English or 简体中文 → a short film plays → the invitation
appears on the sheet of paper it ends on → **Reply to invitation** opens the reply form.

| Folder | What it is |
|---|---|
| [`invite/`](invite/README.md) | The invitation (HTML, CSS, JavaScript and the prepared film) |
| [`backend/`](backend/README.md) | The reply server (Cloudflare Worker + D1), the private Google Sheet script and tests. **Not deployed.** |

**Online preview:** https://coatful.github.io/wedding-invitation/ (GitHub Pages). GitHub can't run the
reply server, so there the form is a preview that sends and stores nothing. All wording is draft, and the time
(5 to 9 pm) is provisional.

Not included here: the original 15 MB film (`invite/source/`, needed only to re-prepare the film) and
earlier versions of the invitation.
