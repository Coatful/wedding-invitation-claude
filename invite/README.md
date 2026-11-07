# Invitation preview: Aloysius Ng & Wei Meixiang · 17 July 2027

**The guest flow:** visit the site → choose **English** or **简体中文** → the film plays → the invitation appears on the sheet of paper the film ends on → **Reply to invitation** opens the reply form.

This is a preview:

- Nothing is deployed.
- **Replies are saved by the reply server in `../backend`**, which runs on this Mac for now (see its README).
  - Served by it at http://127.0.0.1:8787, replies go to a local test database.
  - Opened straight from disk or from the plain Wi-Fi preview, the form sends and stores nothing.
- All wording is draft. The time, 5 to 9 pm, is provisional.

**Earlier versions,** kept for comparison: the scroll-driven version in `../scroll/` and the code-drawn animatic in `../animatic/`. You can delete either.

## How to view it

- **On the Mac:** double-click `index.html` (Safari or Chrome). No server or internet connection is needed.
- **On your phone,** while the Wi-Fi preview is running: http://192.168.88.14:8765/invite/
- **Sound:** tapping a language starts the film with its own soundtrack. The speaker button mutes it. If a browser blocks sound, the film plays silently and the speaker button turns it on.
- **Available during the film:**
  - **Skip intro / 跳过开场** jumps to the finished card.
  - **Reply / 回复** jumps there and opens the form.
  - **EN / 中文** switches language at any time, including inside the form, and keeps what has been typed.
- **When it ends:** **Watch again / 再看一次** replays the film.
- **Reduce motion** (on the language screen; ticked automatically when the phone's own setting is on):
  - The film doesn't play; the finished card and Reply button appear straight away.
  - **Play film** remains available if the guest wants it.
- **If the phone pauses the film** (for example when the guest switches apps), a **Continue** button appears.

## The film

| Time | What you see | Text |
|---|---|---|
| 0–5.5 s | Behind the couple, walking hand in hand towards the arch, lake and mountain | "Aloysius & Meixiang · invite you to their wedding" |
| 5.5–7.7 s | The camera passes between them to the signing table | None |
| 7.7–10 s | The camera settles on the blank sheet | The border draws itself, then the monogram and invitation text appear on the paper |
| End | The finished card holds | **Reply to invitation** |

All timings are in `invite.js` (`FADES`).

- **Phones:** the film fills the screen, cropped to keep the couple centred.
- **The invitation** is laid onto the paper in perspective, and follows the paper while the camera is still moving.
- **Card layout:** the card's border and text are fitted to whatever part of the sheet each screen can see. On a phone held sideways, the monogram and divider drop away so the words stay readable.

## The invitation card (draft wording)

| English | 简体中文 |
|---|---|
| A & M monogram in a leaf wreath | (same monogram) |
| Aloysius Ng & Wei Meixiang | 黄胤杰 与 魏美翔 |
| request the pleasure of your company at their wedding | 诚挚邀请您 见证我们的婚礼 |
| SATURDAY · 17 · JULY 2027 | 星期六 · 17 · 2027年7月 |
| SHANGRI-LA SINGAPORE · 5 – 9 pm | 新加坡香格里拉大酒店 · 下午5时至晚上9时 |
| Kindly reply by 17 June 2027 | 敬请于2027年6月17日前回复 |

- **Venue:** you said "Shangri-La Orchard". The hotel's own name is Shangri-La Singapore, at 22 Orange Grove Road, so the card uses that.
- **Chinese name:** 新加坡香格里拉大酒店 is the commonly used name, but it isn't confirmed from an official source. Check it with the hotel.
- **Time:** 5 to 9 pm is provisional. When it changes, update `STR` in `invite.js` and `../backend/src/event.js`, which the email copy uses.
- **Reply deadline:** "Kindly reply by 17 June 2027" matches the edit cutoff in your plan. Whether first-time replies also close then is still undecided; it is `FIRST_REPLIES_CLOSE_AT` in `../backend/wrangler.jsonc`.

## The reply form

It follows section D of `WEDDING_INVITATION_PLAN.md`:

- **Per person:** a name, and **Will attend / Will not attend** for each person.
- **Family members:** **Add family member** adds another person, and **Remove member** takes one out before sending. A reply is capped at 12 people (`MAX_PEOPLE` in the backend); the real limit is still yours to decide.
- **Optional email:** labelled with the plan's wording, with its purpose explained beside the field.
- **Not collected:** phone, address, dietary questions or messages.
- **Before sending:** **Review reply** shows a short summary and a privacy note, then **Save response**.
- **Confirmation:** "Your reply has been saved", with the time in Singapore and a reference such as R-7K2M-9QXA, which guests can quote to Aloysius.
  - **Email given:** a copy with a private edit link is on its way.
  - **No email:** **Edit response** works for 30 minutes; after that, contact Aloysius.
- **Changes:**
  - The emailed link opens the reply straight into the form, skipping the film, until 17 June 2027. After that it shows the reply read-only.
  - You can make a link for any guest from the Google Sheet.
- **If something goes wrong:**
  - **Dropped connection:** the guest sees a clear message, and tapping Save again saves once.
  - **Reply changed elsewhere:** the guest sees the latest version.
  - **Replies closed:** the form says so.
  - **Broken link:** the language screen explains it.
- **Data in the browser:** nothing is stored. The private link is held in memory only, and the email field is cleared after saving.
- **Checks:** missing names, a missing attendance choice and a mistyped email address are flagged beside the field. The first problem receives focus. The server checks everything again.

## Review tools (for the two of you)

- Add `?review=1` to the address to get a **Review** button. It opens play/pause, restart, speed (1×, ½×, ¼×), a timeline and jump buttons.
- Other address options:
  - `?t=8.6` opens paused at 8.6 s with the panel open.
  - `?t=end` opens on the finished card.
  - `?lang=zh` starts in Simplified Chinese.
  - `?motion=reduced` shows the reduced-motion version.

## Re-preparing the film if the video changes

```bash
cd "Wedding Invitation/invite"
python3 -E -P tools/build_media.py source/NEW-VIDEO.mp4 media
```

- **Requirements:** ffmpeg (Homebrew) and Pillow.
- **What the script makes:**
  - `media/invite.mp4`: H.264 with the original sound, about 3.8 MB.
  - The first and last frames as stills.
  - The paper-tracking data.
- **Settings to check against new footage:**
  - `PAPER_LAST`: the sheet's corners on the new last frame.
  - `FOCUS_X`: where phones crop the picture.

## Known limits

- **Tested in headless Chrome:**
  - 390×844 and 375×667 phones, a 768×1024 tablet, an 844×390 landscape phone and a 1440×900 computer.
  - Real playback to the end, Skip, the Reply shortcut and reduced motion.
  - Every step of the form, including a language switch mid-form.
  - Opening the page straight from disk.
  - With the reply server, `npm run test:browser` in `../backend` covers:
    - Saving, changing, the emailed link and a reply in Chinese.
    - A dropped connection, the view after 17 June, closed replies and a broken link.
- **Not tested:** real iPhones or Android phones, Safari, or the WhatsApp and WeChat in-app browsers.
- **Soundtrack:** it is the video's own. Check it is what you want guests to hear.
- **Phone sharpness:** the film is 1280×720 landscape, so phones show a cropped, enlarged slice. A vertical 1080×1920 render would look sharper on phones.
