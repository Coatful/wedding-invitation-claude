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
- **Music:** tapping a language starts the music: *Heartbeat*, then *A Walk in the Skies*, on a loop.
  - It carries on after the film, and the film itself is silent.
  - The speaker button turns it off and on.
  - It pauses while the guest is in another app or tab.
  - Opened from an edit link, the music waits until the speaker is tapped, because browsers only allow sound after a tap.
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

## Music

- **Tracks:** *Heartbeat*, then *A Walk in the Skies*, both by Joe Hisaishi from the *Howl's Moving Castle* soundtrack.
  - They are joined into one looping file, `media/soundtrack.m4a` (2.4 MB, AAC 128 kbps), so nothing has to load between pieces.
  - The album's own balance between the pieces is kept. *A Walk in the Skies* starts softly and builds, as on the album.
  - The pauses between the pieces, and before the loop restarts, are trimmed to about a second each.
- **Making it again:** run `python3 -E -P tools/build_music.py media/soundtrack.m4a ".../04. Heartbeat.mp3" ".../03. A Walk in the Skies.mp3"`.
- **Not in the public GitHub repository:** these are commercial recordings. The file is published to the live site only, and the GitHub preview has no music. Keep the original MP3s.
- **Licensing:** playing commercial recordings on a public website normally needs permission from the rights holders. A licensed or royalty-free track avoids that question.

## Photos on the card

Four illustrations are pasted on the card like small prints, each with a white border and a slight tilt:
- the penguins at Asahiyama Zoo
- Odori Park in Sapporo
- Lake Toya
- the proposal on Tenguyama

They settle onto the paper one by one as the invitation appears.

- **Files:** `media/memories/*.jpg`, square, 512 px, about 40–90 KB each. The originals are in `../references/memories/`.
- **Layout:** `card-photos.js` stores each photo's centre, width and tilt as fractions of the card, so the layout fits every screen size.
- **On phones:** the card is narrower than on a computer, so the words fill more of it.
  - Where a photo would come within a few pixels of the words, it first slides further into its corner (staying inside the border), then shrinks only if sliding isn't enough.
  - A photo that would need to be smaller than about half size is left out on that screen. No photo is left out on any of the 19 sizes tested.
  - **Tested:** 19 screen sizes from a 320-pixel-wide phone to a 1920×1080 screen, in English and Chinese.
    - On computers, and on a 768×1024 iPad, the photos sit exactly where you put them.
    - On most phones (iPhone mini to Pro Max, Pixel, 360×800 Android) all four keep their full size and only move.
    - On smaller screens (iPhone SE, small Android phones, in-app browsers) and on an 820×1180 iPad, some shrink to between 80% and 97% of their size, mostly the lower two.
  - The settings are `PHOTO_GAP`, `PHOTO_EDGE` and `PHOTO_MIN` in `invite.js`.
- **The reply line:** with photos on the card, it is set on two lines ("Kindly reply / by 17 June 2027"), so it fits between the lower photos.
- **Editing the layout on this Mac:**
  1. Open the invitation with `?layout=edit` at the end of the address. This works with:
     - the local server, as in `../backend` `npm run dev` → http://127.0.0.1:8787/?layout=edit
     - opening `index.html?layout=edit` from disk
  2. Drag a photo to move it, its corner dot to resize, or its top dot to tilt. Arrow keys nudge, `+`/`-` resize and `[`/`]` tilt.
  3. Untick a photo to hide it.
  4. **See it on the paper** previews the real view. While editing, the photos show exactly as laid out; on the paper, they make room for the words the way they will on a guest's screen of the same size.
  5. **Save layout** downloads a new `card-photos.js`. Put it in place of this one, then publish.
- **Who sees the editor:** it only switches on when the page is opened from disk or from `localhost`, so guests never see it.

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
  - `media/invite.mp4`: H.264 with the original sound, about 10 MB. The 720p original is enlarged to 1080p and sharpened, because phones show only the middle of the film, greatly enlarged.
  - The first and last frames as stills, enlarged and sharpened the same way.
  - The paper-tracking data, measured on the original frames.
- **Settings to check against new footage:**
  - `PAPER_LAST`: the sheet's corners on the new last frame.
  - `FOCUS_X`: where phones crop the picture.
  - `OUTPUT_HEIGHT` and `SHARPEN`: the published size and the sharpening strength. If the new footage is already 1080p or larger, set `OUTPUT_HEIGHT = 0` and consider a lower `SHARPEN`.

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
- **Phone sharpness:** the original film is 1280×720 landscape, so phones show a cropped, enlarged slice.
  - It is published enlarged to 1080p and sharpened, which brings out the detail the original has but can't add more.
  - The fast camera move at 5–7.5 s is blurred in the original itself.
  - A vertical 1080×1920 (or 4K) render from the video tool would be sharper still.
