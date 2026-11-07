/*
  Invitation preview — Aloysius Ng & Wei Meixiang · 17 July 2027.

  Flow: choose a language → the film plays (with its sound) → the invitation appears on the
  blank sheet of paper the film ends on → "Reply to invitation" opens the reply form.

  The film is source/playground-result-….mp4, prepared by tools/build_media.py.
  Replies are saved by the reply server in ../backend (Cloudflare Worker + D1) when the page is
  served by it. Opened from disk or from a plain file server, the form is a preview that sends
  nothing. A private edit link (#edit=…) opens a saved reply for changes. All wording is draft.
*/
(function () {
  'use strict';

  var FILM = window.FILM;
  function $(id) { return document.getElementById(id); }
  if (!FILM) {
    $('loadStatus').textContent = 'The film is missing. Run tools/build_media.py first.';
    return;
  }

  var END = FILM.duration;
  var PW = FILM.paper.size[0], PH = FILM.paper.size[1];
  var MAX_PEOPLE = 12;       // replaced by the reply server's MAX_PEOPLE setting when connected
  // "Heartbeat" then "A Walk in the Skies", joined into one looping file by tools/build_music.py.
  // It is not in the public GitHub repository, so the GitHub preview simply has no music.
  var MUSIC_SRC = 'media/soundtrack.m4a';
  var PAD_X = 16, PAD_Y = 20; // .c-body padding in styles.css
  var SHOTS = [['Start', 0], ['Walk', 2.5], ['Arch', 5.6], ['Table', 7.0], ['Card', 8.4], ['End', END]];

  // When things appear, in seconds of film: [in from, fully in] or [in from, in, out from, gone]
  var FADES = {
    introNames: [-1, 0, 4.67, 5.5],
    introLine: [1.25, 2.1, 4.67, 5.5],
    border: [7.9, 9.3],
    cMono: [8.1, 8.8],
    cNames: [8.3, 9.0],
    cRequest: [8.6, 9.3],
    cDate: [8.8, 9.5],
    cPlace: [9.0, 9.6],
    cDetails: [9.1, 9.7],
    cRule: [9.2, 9.8],
    cRsvp: [9.3, 9.95]
  };
  var CARD_IDS = ['cMono', 'cNames', 'cRequest', 'cDate', 'cPlace', 'cDetails', 'cRule', 'cRsvp'];
  var PHOTO_FADES = [[8.8, 9.5], [9.0, 9.7], [9.2, 9.9], [9.4, 10.0]];   // the card photos settle onto the paper one by one

  // ---------- Copy (draft wording, to be approved) ----------
  var STR = {
    en: {
      htmlLang: 'en-SG',
      introNames: 'Aloysius & Meixiang',
      introLine: 'invite you to their wedding',
      names: ['Aloysius Ng', '&', 'Wei Meixiang'],
      namesLabel: 'Aloysius Ng and Wei Meixiang',
      request: ['request the pleasure of your company', 'at their wedding'],
      day: 'Saturday', num: '17', month: 'July 2027',
      place: 'Shangri-La Singapore',
      details: '5 – 9 pm',
      rsvpLine: 'Kindly reply by 17 June 2027',
      rsvpLineStacked: 'Kindly reply\nby 17 June 2027',     // between the lower card photos
      skip: 'Skip intro', replay: 'Watch again', play: 'Play film', replyChip: 'Reply', resume: '▶ Continue',
      soundOff: 'Turn sound off', soundOn: 'Turn sound on',
      reply: 'Reply to invitation',
      langBtn: '中文', langLabel: 'Switch to Simplified Chinese',
      note: 'Preview · wording is draft and replies aren’t sent anywhere yet',
      noteTest: 'Test version · replies are saved only on this computer',
      filmError: 'The film couldn’t play here, so here’s the invitation.',
      ready: 'Ready · 已就绪',
      scene: 'A short film. A bride in a white gown and veil and a groom in a pale blue suit, seen from behind, walk hand in hand through deep snow towards a flower arch, with a lake and a snow-capped mountain beyond. The view passes between them to a small signing table and settles on a sheet of paper, where the invitation appears.',
      // reply form
      formEyebrow: 'Aloysius Ng & Wei Meixiang · 17 July 2027',
      formTitle: 'Reply to invitation',
      formIntro: 'Please reply for yourself and each invited family member. Replies can be changed until 17 June 2027.',
      guest: 'Guest',
      guestName: 'Guest name',
      attendance: 'Attendance',
      attend: 'Will attend', decline: 'Will not attend',
      add: '+ Add family member',
      remove: 'Remove member',
      maxNote: 'One reply can include up to {max} people.',
      emailLabel: 'Email me a copy of this response and my private edit link (optional)',
      emailNote: 'Your email is optional and will be used only to send this response and your private edit link. You can submit without an email. Please keep the edit link private.',
      toReview: 'Review reply',
      errName: 'Please enter a name.',
      errAttend: 'Please choose Will attend or Will not attend.',
      errEmail: 'Please check the email address, or leave it blank.',
      errSummary: 'Please check the highlighted answers.',
      reviewTitle: 'Check your reply',
      reviewEmail: 'Email copy to: {email}',
      reviewNoEmail: 'No email copy.',
      privacy: 'Only Aloysius and Meixiang can see replies. Names and choices are used only to plan the wedding.',
      back: 'Back to edit', save: 'Save response',
      doneBanner: 'Preview only · nothing was sent or saved',
      doneTitle: 'Thank you!',
      doneLead: 'This is the reply you entered:',
      doneEmail: 'Once replies are connected, a copy and your private edit link will be emailed to {email}.',
      doneNoEmail: 'To request a change, please contact Aloysius directly.',
      editAgain: 'Edit response', close: 'Close',
      replyEdit: 'Your reply',
      formTitleEdit: 'Change your reply',
      formIntroEdit: 'Make your changes, then review and save. Replies can be changed until 17 June 2027.',
      saving: 'Saving…',
      doneLeadSaved: 'Your reply has been saved:',
      doneLeadUpdated: 'Your changes have been saved:',
      doneMeta: 'Saved {time} (Singapore time) · Reference {ref}',
      doneEmailLive: 'A copy with your private edit link is on its way to {email}. If it hasn’t arrived in a few minutes, please check your spam folder.',
      doneEmailFailed: 'We couldn’t send an email copy just now, but your reply is saved.',
      doneNoEmailLive: 'You can still use “Edit response” for the next 30 minutes. After that, please contact Aloysius to change your reply.',
      doneLinkAgain: 'You can change it again with the same link until 17 June 2027.',
      doneOrganizer: 'Saved as a correction by Aloysius and Meixiang.',
      errNetwork: 'We couldn’t reach the server, so your reply isn’t saved yet. Please check your connection and try again.',
      errServer: 'Something went wrong on our side, so your reply isn’t saved yet. Please try again in a moment, or contact Aloysius.',
      errBusy: 'Too many attempts from this connection. Please wait a few minutes and try again.',
      errInvalid: 'Part of this reply couldn’t be accepted. Please go back, check the names and try again.',
      errTooMany: 'One reply can include up to {max} people. Please contact Aloysius about a larger group.',
      errConflict: 'This reply was changed somewhere else in the meantime, so your changes weren’t saved. The latest version is shown below; please go back and make your changes again.',
      errLinkExpired: 'Your time to edit has ended. To change your reply, please use the link in your email, or contact Aloysius.',
      errLinkInvalid: 'This link isn’t working any more. Please use the link in your latest email, or contact Aloysius.',
      errEditsClosed: 'Changes closed on 17 June 2027. To change your reply, please contact Aloysius.',
      errRepliesClosed: 'Replies have closed. Please contact Aloysius directly.',
      closedTitle: 'Replies have closed',
      closedText: 'Please contact Aloysius directly if you still need to reply.',
      editsClosedTitle: 'Your reply',
      editsClosedText: 'Changes closed on 17 June 2027. To change anything, please contact Aloysius.',
      dialogLang: '中文'
    },
    zh: {
      htmlLang: 'zh-Hans-SG',
      introNames: '黄胤杰 与 魏美翔',
      introLine: '诚邀您见证我们的婚礼',
      names: ['黄胤杰', '与', '魏美翔'],
      namesLabel: '黄胤杰 与 魏美翔',
      request: ['诚挚邀请您', '见证我们的婚礼'],
      day: '星期六', num: '17', month: '2027年7月',
      place: '新加坡香格里拉大酒店',
      details: '下午5时至晚上9时',
      rsvpLine: '敬请于2027年6月17日前回复',
      rsvpLineStacked: '敬请于\n2027年6月17日\n前回复',
      skip: '跳过开场', replay: '再看一次', play: '播放影片', replyChip: '回复', resume: '▶ 继续播放',
      soundOff: '关闭声音', soundOn: '打开声音',
      reply: '回复出席情况',
      langBtn: 'EN', langLabel: 'Switch to English',
      note: '预览版 · 文字为草稿，回复暂不会发送',
      noteTest: '测试版 · 回复仅保存在这台电脑上',
      filmError: '影片无法在此播放，以下是请柬内容。',
      ready: 'Ready · 已就绪',
      scene: '一段短片。身穿白色婚纱、披着头纱的新娘与身穿浅蓝色西装的新郎背对镜头，手牵手走过厚厚的积雪，走向花拱门，远处是湖泊与雪山。镜头从两人之间穿过，来到签字桌，最后停在一张纸上，请柬内容随之出现。',
      formEyebrow: '黄胤杰 与 魏美翔 · 2027年7月17日',
      formTitle: '回复出席情况',
      formIntro: '请为您本人及每位受邀家人回复。2027年6月17日前可修改回复。',
      guest: '宾客',
      guestName: '宾客姓名',
      attendance: '是否出席',
      attend: '出席', decline: '不出席',
      add: '+ 添加家庭成员',
      remove: '移除此成员',
      maxNote: '每份回复最多可填写{max}人。',
      emailLabel: '将本次回复及我的专属修改链接发送到我的邮箱（选填）',
      emailNote: '邮箱为选填项，仅用于发送本次回复及您的专属修改链接。不填写邮箱也可以提交。请妥善保管修改链接。',
      toReview: '检查回复',
      errName: '请输入姓名。',
      errAttend: '请选择出席或不出席。',
      errEmail: '请检查邮箱地址，或留空。',
      errSummary: '请检查标出的内容。',
      reviewTitle: '请确认您的回复',
      reviewEmail: '回复副本将发送至：{email}',
      reviewNoEmail: '不发送邮件副本。',
      privacy: '只有黄胤杰和魏美翔可以查看回复。姓名与出席选择仅用于婚礼筹备。',
      back: '返回修改', save: '保存回复',
      doneBanner: '预览版 · 未发送或保存任何内容',
      doneTitle: '谢谢您！',
      doneLead: '以下是您填写的回复：',
      doneEmail: '回复功能接通后，回复副本及专属修改链接将发送至 {email}。',
      doneNoEmail: '如需修改，请直接联系 Aloysius（黄胤杰）。',
      editAgain: '修改回复', close: '关闭',
      replyEdit: '您的回复',
      formTitleEdit: '修改您的回复',
      formIntroEdit: '请修改后检查并保存。2027年6月17日前可修改回复。',
      saving: '正在保存…',
      doneLeadSaved: '您的回复已保存：',
      doneLeadUpdated: '您的修改已保存：',
      doneMeta: '保存时间：新加坡时间 {time} · 回复编号 {ref}',
      doneEmailLive: '回复副本及您的专属修改链接正在发送至 {email}。如几分钟后仍未收到，请查看垃圾邮件。',
      doneEmailFailed: '暂时无法发送邮件副本，但您的回复已保存。',
      doneNoEmailLive: '接下来30分钟内，您仍可点击“修改回复”。之后如需修改，请联系 Aloysius（黄胤杰）。',
      doneLinkAgain: '2027年6月17日前，您可以继续使用同一链接修改。',
      doneOrganizer: '已作为新人代为修改的内容保存。',
      errNetwork: '无法连接服务器，回复尚未保存。请检查网络后重试。',
      errServer: '系统出现问题，回复尚未保存。请稍后重试，或联系 Aloysius（黄胤杰）。',
      errBusy: '此网络的尝试次数过多，请稍等几分钟后重试。',
      errInvalid: '部分内容无法提交。请返回检查姓名后重试。',
      errTooMany: '每份回复最多可填写{max}人。如人数更多，请联系 Aloysius（黄胤杰）。',
      errConflict: '此回复刚刚在别处被修改，您的修改未保存。下方显示的是最新版本，请返回重新修改。',
      errLinkExpired: '修改时间已结束。如需修改，请使用邮件中的链接，或联系 Aloysius（黄胤杰）。',
      errLinkInvalid: '此链接已失效。请使用最新邮件中的链接，或联系 Aloysius（黄胤杰）。',
      errEditsClosed: '修改已于2027年6月17日截止。如需修改，请联系 Aloysius（黄胤杰）。',
      errRepliesClosed: '回复已截止。请直接联系 Aloysius（黄胤杰）。',
      closedTitle: '回复已截止',
      closedText: '如仍需回复，请直接联系 Aloysius（黄胤杰）。',
      editsClosedTitle: '您的回复',
      editsClosedText: '修改已于2027年6月17日截止。如需修改，请联系 Aloysius（黄胤杰）。',
      dialogLang: 'EN'
    }
  };

  var ICON_SOUND = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path class="i-fill" d="M4 9.5v5h3.6L12 18.6V5.4L7.6 9.5z"/><path class="i-line" d="M15.5 9a4.2 4.2 0 0 1 0 6M17.8 6.6a7.6 7.6 0 0 1 0 10.8"/></svg>';
  var ICON_MUTED = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path class="i-fill" d="M4 9.5v5h3.6L12 18.6V5.4L7.6 9.5z"/><path class="i-line" d="M15.5 9.5l5 5M20.5 9.5l-5 5"/></svg>';
  var ICON_X = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M7 7l10 10M17 7L7 17"/></svg>';

  // ---------- Helpers ----------
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function smooth(p) { p = clamp(p, 0, 1); return p * p * (3 - 2 * p); }
  function ramp(x, a, b) { return smooth((x - a) / (b - a)); }
  function fade(x, t) {
    var a = ramp(x, t[0], t[1]);
    return t.length > 2 ? Math.min(a, 1 - ramp(x, t[2], t[3])) : a;
  }
  function show(el, on) { if (el.hidden === on) el.hidden = !on; }
  function el(tag, cls) { var n = document.createElement(tag); if (cls) n.className = cls; return n; }
  function fmt(s, v) { return s.replace(/\{(\w+)\}/g, function (m, k) { return v[k]; }); }

  // ---------- Elements and state ----------
  var ui = {};
  ['stage', 'film', 'posterImg', 'finalImg', 'paperLayer', 'paper', 'card', 'cBorder', 'cBody', 'cInner',
    'cDay', 'cNum', 'cMonth', 'ui', 'sceneDesc', 'topbar', 'langBtn', 'soundBtn', 'reviewBtn', 'replyChip',
    'skipBtn', 'replayBtn', 'intro', 'introNames', 'introLine', 'buffering', 'resumeBtn', 'endActions',
    'replyBtn', 'placeholderNote', 'toast', 'review', 'rvPlay', 'rvRestart', 'rvSpeed', 'rvTime', 'rvScrub',
    'rvShots', 'rvClose', 'rsvp', 'rsvpBackdrop', 'rsvpSheet', 'rsvpLang', 'rsvpClose', 'rsvpForm',
    'rsvpEyebrow', 'rsvpTitle', 'rsvpIntro', 'errorSummary', 'people', 'addPerson', 'maxNote', 'emailLabel',
    'email', 'emailNote', 'emailError', 'toReview', 'rsvpReview', 'reviewTitle', 'reviewList', 'reviewEmail',
    'privacyNote', 'backToEdit', 'saveBtn', 'rsvpDone', 'doneBanner', 'doneTitle', 'doneLead', 'doneList',
    'doneNext', 'editAgain', 'doneClose', 'gate', 'reduceMotion', 'loadStatus', 'website', 'saveError', 'doneMeta',
    'rsvpNotice', 'noticeTitle', 'noticeText', 'noticeList', 'noticeClose', 'emailBlock', 'music', 'cPhotos',
    'door', 'doorCam', 'doorBackdrop', 'doorScene', 'doorPic', 'doorWay', 'doorL', 'doorR'
  ].concat(CARD_IDS).forEach(function (id) { ui[id] = $(id); });

  // Shown on the language screen, so in both languages at once
  var GATE = {
    opening: 'Opening your reply… · 正在打开您的回复…',
    linkInvalid: 'This link isn’t working any more. Please use the link in your latest email, or contact Aloysius. · 此链接已失效。请使用最新邮件中的链接，或联系 Aloysius（黄胤杰）。',
    linkError: 'Your reply couldn’t be opened. Please check your connection and tap the link in your email again. · 无法打开您的回复。请检查网络后再次点击邮件中的链接。'
  };

  var video = ui.film;
  var params = new URLSearchParams(location.search);
  var reviewEnabled = params.get('review') === '1' || (params.has('t') && params.get('review') !== '0');
  // The card-photo layout editor: only on this Mac (opened from disk or a local server), never for guests.
  var EDIT = params.get('layout') === 'edit' &&
    (location.protocol === 'file:' || /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname));
  var state = {
    started: false, reduced: false, lang: 'en', phase: 'gate',   // gate → door → playing → ended
    soundOn: true, ownPause: false, startT: 0, frameT: -1, doorUntil: 0,
    review: false, scrubbing: false, layoutV: 0
  };
  // mode 'new' until saved; then 'edit' with a private credential (kept in memory only, never stored)
  var reply = {
    people: [{ name: '', att: '' }], errors: {}, view: 'form', mode: 'new',
    token: null, kind: null, id: null, revision: 0, savedAt: null, wasNew: false,
    idemKey: null, saving: false, saveError: '', emailTo: '', emailState: 'none', notice: ''
  };

  // ---------- Geometry: where the film sits on screen, and where the sheet is ----------
  function cover() {
    var W = ui.stage.clientWidth || window.innerWidth, H = ui.stage.clientHeight || window.innerHeight;
    var k = Math.max(W / FILM.w, H / FILM.h);
    return { W: W, H: H, k: k, ox: (W - FILM.w * k) * FILM.focusX, oy: (H - FILM.h * k) / 2 };
  }
  function quadAt(f) {   // the sheet's corners (source pixels) at a fractional frame
    var Q = FILM.paper.quads, x = clamp(f - FILM.paper.first, 0, Q.length - 1);
    var i = Math.floor(x), j = Math.min(i + 1, Q.length - 1), a = x - i, out = [];
    for (var m = 0; m < 8; m++) out.push(Q[i][m] + (Q[j][m] - Q[i][m]) * a);
    return out;
  }
  function toScreen(q, g) {
    var s = [];
    for (var m = 0; m < 8; m += 2) s.push(q[m] * g.k + g.ox, q[m + 1] * g.k + g.oy);
    return s;
  }
  // Perspective mapping from a w×h rectangle onto four corners (top-left, top-right, bottom-right, bottom-left)
  function homography(w, h, p) {
    var x0 = p[0], y0 = p[1], x1 = p[2], y1 = p[3], x2 = p[4], y2 = p[5], x3 = p[6], y3 = p[7];
    var dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3;
    var dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3;
    var den = dx1 * dy2 - dx2 * dy1;
    var g = (dx3 * dy2 - dx2 * dy3) / den, hh = (dx1 * dy3 - dx3 * dy1) / den;
    return {
      a: (x1 - x0 + g * x1) / w, b: (x3 - x0 + hh * x3) / h, c: x0,
      d: (y1 - y0 + g * y1) / w, e: (y3 - y0 + hh * y3) / h, f: y0,
      g: g / w, h: hh / h
    };
  }
  function mapPt(M, u, v) {
    var z = M.g * u + M.h * v + 1;
    return [(M.a * u + M.b * v + M.c) / z, (M.d * u + M.e * v + M.f) / z];
  }
  function cssMatrix(M) {
    return 'matrix3d(' + [M.a, M.d, 0, M.g, M.b, M.e, 0, M.h, 0, 0, 1, 0, M.c, M.f, 0, 1].map(function (v) {
      return +v.toFixed(10);
    }).join(',') + ')';
  }

  // ---------- The card: fitted to the part of the sheet each screen can see ----------
  var cardBox = { x: 24, y: 24, w: 380, h: 592 }, borderPaths = [], borderLens = [], borderOrn = null;

  // Binary search on a test that flips once. first=true: smallest passing value; else largest.
  function search(lo, hi, ok, first) {
    if (first) { if (ok(lo)) return lo; if (!ok(hi)) return hi; } else { if (ok(hi)) return hi; if (!ok(lo)) return lo; }
    for (var i = 0; i < 24; i++) {
      var mid = (lo + hi) / 2;
      if (ok(mid) === first) hi = mid; else lo = mid;
    }
    return first ? hi : lo;
  }

  function layoutCard() {
    var g = cover(), Q = FILM.paper.quads;
    var M = homography(PW, PH, toScreen(Q[Q.length - 1], g));
    function pt(u, v) { return mapPt(M, u, v); }
    var sheetRight = Math.max(pt(PW, 0)[0], pt(PW, PH)[0]);
    var beside = g.W >= 700 && sheetRight + 310 <= g.W - 16;
    ui.endActions.classList.toggle('beside', beside);
    var top = ui.topbar.offsetTop + ui.topbar.offsetHeight + 10;
    var bottom = beside ? g.H - 18 : ui.endActions.offsetTop - 14;
    var left = 14, right = g.W - 14, inset = 14;
    var y0 = search(inset, PH * 0.45, function (v) { return Math.min(pt(inset, v)[1], pt(PW - inset, v)[1]) >= top; }, true);
    var y1 = search(PH * 0.55, PH - inset, function (v) { return Math.max(pt(inset, v)[1], pt(PW - inset, v)[1]) <= bottom; }, false);
    var x = search(inset, PW / 2 - 80, function (u) {
      return Math.min(pt(u, y0)[0], pt(u, y1)[0]) >= left && Math.max(pt(PW - u, y0)[0], pt(PW - u, y1)[0]) <= right;
    }, true);
    cardBox = { x: x, y: y0, w: PW - 2 * x, h: y1 - y0 };
    var s = ui.card.style;
    s.left = x + 'px'; s.top = y0 + 'px'; s.width = cardBox.w + 'px'; s.height = cardBox.h + 'px';
    buildBorder(cardBox.w, cardBox.h);
    fitCard();
    placePhotos();
    state.layoutV++;
  }

  function fitCard() {
    var inner = ui.cInner, body = ui.cBody;
    body.classList.remove('compact');
    inner.style.transform = 'none';
    var availW = cardBox.w - 2 * PAD_X, availH = cardBox.h - 2 * PAD_Y;
    function scale() { return Math.min(1.08, availH / inner.offsetHeight, availW / Math.max(inner.scrollWidth, 1)); }
    var k = scale();
    if (k < 0.9) { body.classList.add('compact'); k = scale(); }
    inner.style.transform = 'scale(' + clamp(k, 0.55, 1.08).toFixed(3) + ')';
  }

  // A double rule with inward-curved corners, drawn from the top centre round to the bottom centre.
  function buildBorder(w, h) {
    var r = 9, i = 5, R = r + i, a = Math.sqrt(R * R - i * i), cx = w / 2;
    function n(v) { return +v.toFixed(2); }
    var d = [
      ['b-outer', 'M' + n(cx) + ' 0H' + r + 'A' + r + ' ' + r + ' 0 0 1 0 ' + r + 'V' + n(h - r) + 'A' + r + ' ' + r + ' 0 0 1 ' + r + ' ' + n(h) + 'H' + n(cx)],
      ['b-outer', 'M' + n(cx) + ' 0H' + n(w - r) + 'A' + r + ' ' + r + ' 0 0 0 ' + n(w) + ' ' + r + 'V' + n(h - r) + 'A' + r + ' ' + r + ' 0 0 0 ' + n(w - r) + ' ' + n(h) + 'H' + n(cx)],
      ['b-inner', 'M' + n(cx) + ' ' + i + 'H' + n(a) + 'A' + R + ' ' + R + ' 0 0 1 ' + i + ' ' + n(a) + 'V' + n(h - a) + 'A' + R + ' ' + R + ' 0 0 1 ' + n(a) + ' ' + n(h - i) + 'H' + n(cx)],
      ['b-inner', 'M' + n(cx) + ' ' + i + 'H' + n(w - a) + 'A' + R + ' ' + R + ' 0 0 0 ' + n(w - i) + ' ' + n(a) + 'V' + n(h - a) + 'A' + R + ' ' + R + ' 0 0 0 ' + n(w - a) + ' ' + n(h - i) + 'H' + n(cx)]
    ];
    var svg = ui.cBorder, ns = 'http://www.w3.org/2000/svg';
    svg.setAttribute('viewBox', '0 0 ' + n(w) + ' ' + n(h));
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    borderPaths = []; borderLens = [];
    d.forEach(function (p) {
      var path = document.createElementNS(ns, 'path');
      path.setAttribute('class', p[0]);
      path.setAttribute('d', p[1]);
      svg.appendChild(path);
      var len = path.getTotalLength();
      path.style.strokeDasharray = len + ' ' + len;
      borderPaths.push(path); borderLens.push(len);
    });
    borderOrn = document.createElementNS(ns, 'g');
    borderOrn.setAttribute('class', 'b-orn');
    [[cx, 2.5], [cx, h - 2.5]].forEach(function (c) {
      var dia = document.createElementNS(ns, 'path');
      dia.setAttribute('d', 'M' + n(c[0]) + ' ' + n(c[1] - 4.2) + 'L' + n(c[0] + 4.2) + ' ' + n(c[1]) + 'L' + n(c[0]) + ' ' + n(c[1] + 4.2) + 'L' + n(c[0] - 4.2) + ' ' + n(c[1]) + 'Z');
      borderOrn.appendChild(dia);
      [-9, 9].forEach(function (dx) {
        var dot = document.createElementNS(ns, 'circle');
        dot.setAttribute('cx', n(c[0] + dx)); dot.setAttribute('cy', n(c[1])); dot.setAttribute('r', '1.1');
        borderOrn.appendChild(dot);
      });
    });
    svg.appendChild(borderOrn);
    lastBorder = -1;
  }

  // The monogram: A & M inside a small wreath of leaves (drawn once).
  function wreathSVG() {
    var cx = 60, cy = 60, r = 43, out = [];
    function n(v) { return v.toFixed(2); }
    function p(deg, rad) { var t = deg * Math.PI / 180; return [cx + rad * Math.cos(t), cy + rad * Math.sin(t)]; }
    [[80, 252, 1], [100, -72, -1]].forEach(function (b) {
      var a0 = b[0], a1 = b[1], dir = b[2], s = p(a0, r), e = p(a1, r);
      out.push('<path class="w-stem" d="M' + n(s[0]) + ' ' + n(s[1]) + 'A' + r + ' ' + r + ' 0 0 ' + (dir > 0 ? 1 : 0) + ' ' + n(e[0]) + ' ' + n(e[1]) + '"/>');
      for (var i = 0; i < 12; i++) {
        var t = (i + 0.6) / 12.4, a = a0 + (a1 - a0) * t, side = i % 2 ? 1 : -1;
        var size = 1 - t * 0.4, rx = 5.8 * size, ry = 2.3 * size;
        var rot = a + 90 * dir - side * 36 * dir, rr = rot * Math.PI / 180;
        var stem = p(a, r), c = [stem[0] + Math.cos(rr) * rx * 0.85, stem[1] + Math.sin(rr) * rx * 0.85];
        out.push('<ellipse class="w-leaf' + (i % 3 === 1 ? ' alt' : '') + '" cx="' + n(c[0]) + '" cy="' + n(c[1]) +
          '" rx="' + n(rx) + '" ry="' + n(ry) + '" transform="rotate(' + n(rot) + ' ' + n(c[0]) + ' ' + n(c[1]) + ')"/>');
        if (i % 4 === 2) {
          var bpt = p(a + 4 * dir, r + 7);
          out.push('<circle class="w-berry" cx="' + n(bpt[0]) + '" cy="' + n(bpt[1]) + '" r="1.5"/>');
        }
      }
    });
    out.push('<text class="w-letters" x="60" y="69" text-anchor="middle">A<tspan class="w-amp" dx="2" dy="-5">&amp;</tspan><tspan dx="2" dy="5">M</tspan></text>');
    return '<svg viewBox="0 0 120 120" aria-hidden="true" focusable="false">' + out.join('') + '</svg>';
  }
  ui.cMono.innerHTML = wreathSVG();

  // ---------- Photos pasted on the card (card-photos.js) ----------
  function copyPhotos(list) {
    return (list || []).map(function (p) {
      return { id: p.id, src: p.src, en: p.en, zh: p.zh, cx: +p.cx, cy: +p.cy, w: +p.w, r: +p.r || 0, show: p.show !== false };
    });
  }
  var PHOTOS = copyPhotos(window.CARD_PHOTOS), photoEls = [];
  function buildPhotos() {
    ui.cPhotos.textContent = '';
    photoEls = PHOTOS.map(function (p) {
      var fig = el('figure', 'c-photo'), img = el('img');
      img.src = p.src;
      img.alt = '';
      img.decoding = 'async';
      img.draggable = false;
      fig.appendChild(img);
      ui.cPhotos.appendChild(fig);
      return { fig: fig, img: img, p: p, shown: -1, base: '' };
    });
    placePhotos();
  }
  // Photo sizes are set on a card of this shape (width / height). On a wider or shorter card (a phone
  // held sideways), they shrink to keep the same share of the card's height, so they don't cover the words.
  var PHOTO_REF_ASPECT = 0.66;
  // The layout is set on a wide card. On a narrow one (a phone) the words fill more of the card, so a photo
  // that would come closer than PHOTO_GAP card pixels to them first slides further into its corner (staying
  // PHOTO_EDGE inside the card's edge), then shrinks, each only as much as needed. A photo that would need to
  // be smaller than PHOTO_MIN of its size is left out on that screen.
  var PHOTO_GAP = 6, PHOTO_EDGE = 8, PHOTO_MIN = 0.55;
  function photoScale() {
    return cardBox.w > 0 && cardBox.h > 0 ? Math.min(1, cardBox.h * PHOTO_REF_ASPECT / cardBox.w) : 1;
  }

  // Outlines of everything printed on the card, in card pixels: each line of text, the rules above and
  // below the day and month, the ornament rule, and the round wreath. Measured with the paper laid flat for
  // an instant (the next frame puts its perspective back).
  function wordShapes() {
    var paper = ui.paper, saved = paper.style.transform, shapes = [];
    paper.style.transform = 'none';
    var c = ui.card.getBoundingClientRect();
    function box(l, t, r, b) { shapes.push([[l - c.left, t - c.top], [r - c.left, t - c.top], [r - c.left, b - c.top], [l - c.left, b - c.top]]); }
    function boxes(list) {
      Array.prototype.forEach.call(list, function (r) { if (r.width > 0.5 && r.height > 0.5) box(r.left, r.top, r.right, r.bottom); });
    }
    Array.prototype.forEach.call(ui.cInner.children, function (node) {
      if (!node.getClientRects().length) return;                    // not shown on this card (compact)
      var svg = node.querySelector('svg');
      if (svg) {
        var bb = svg.getBBox(), r = svg.getBoundingClientRect(), vb = svg.viewBox.baseVal;
        var k = Math.min(r.width / vb.width, r.height / vb.height);
        var x = r.left + (r.width - vb.width * k) / 2 + (bb.x - vb.x) * k, y = r.top + (r.height - vb.height * k) / 2 + (bb.y - vb.y) * k;
        if (node !== ui.cMono) { box(x, y, x + bb.width * k, y + bb.height * k); return; }
        var cx = x + bb.width * k / 2 - c.left, cy = y + bb.height * k / 2 - c.top;
        var R = Math.max(bb.width, bb.height) * k / 2 / Math.cos(Math.PI / 12), ring = [];
        for (var i = 0; i < 12; i++) ring.push([cx + R * Math.cos(i * Math.PI / 6), cy + R * Math.sin(i * Math.PI / 6)]);
        shapes.push(ring);
        return;
      }
      var walk = document.createTreeWalker(node, NodeFilter.SHOW_TEXT), range = document.createRange(), t;
      while ((t = walk.nextNode())) { range.selectNodeContents(t); boxes(range.getClientRects()); }
      Array.prototype.forEach.call(node.querySelectorAll('*'), function (e) {
        if (parseFloat(getComputedStyle(e).borderTopWidth) > 0) boxes(e.getClientRects());
      });
    });
    paper.style.transform = saved;
    return shapes;
  }

  // Distance between two convex outlines; 0 when they touch or overlap.
  function polyGap(A, B) {
    function apart(P) {                    // the widest gap between A and B across P's edges
      var best = -Infinity;
      for (var i = 0; i < P.length; i++) {
        var a = P[i], b = P[(i + 1) % P.length], nx = a[1] - b[1], ny = b[0] - a[0], n = Math.hypot(nx, ny) || 1;
        var lo = [Infinity, Infinity], hi = [-Infinity, -Infinity];
        [A, B].forEach(function (Q, j) {
          Q.forEach(function (q) { var v = (q[0] * nx + q[1] * ny) / n; lo[j] = Math.min(lo[j], v); hi[j] = Math.max(hi[j], v); });
        });
        best = Math.max(best, lo[1] - hi[0], lo[0] - hi[1]);
      }
      return best;
    }
    if (Math.max(apart(A), apart(B)) <= 0) return 0;
    function toEdge(p, a, b) {
      var dx = b[0] - a[0], dy = b[1] - a[1], t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1);
      t = Math.max(0, Math.min(1, t));
      return Math.hypot(a[0] + t * dx - p[0], a[1] + t * dy - p[1]);
    }
    var m = Infinity;
    [[A, B], [B, A]].forEach(function (pair) {
      pair[0].forEach(function (p) {
        pair[1].forEach(function (a, i, Q) { m = Math.min(m, toEdge(p, a, Q[(i + 1) % Q.length])); });
      });
    });
    return m;
  }

  // Where a photo (d card pixels wide) goes so it clears the words: { s: size as a share of the layout's,
  // cx, cy: its new centre }. { s: 1 } with the same centre = as laid out; { s: 0 } = it can't clear them.
  function fitPhoto(p, d, shapes) {
    var W = cardBox.w, H = cardBox.h, a = p.r * Math.PI / 180, cos = Math.cos(a), sin = Math.sin(a), cx = p.cx * W, cy = p.cy * H;
    var V = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(function (s) {
      var x = s[0] * d / 2, y = s[1] * d / 2;
      return [cx + x * cos - y * sin, cy + x * sin + y * cos];
    });
    var left = p.cx < 0.5, top = p.cy < 0.5, X = left ? 0 : W, Y = top ? 0 : H, F = V[0];   // F: its corner nearest the card's corner
    V.forEach(function (v) { if (Math.hypot(v[0] - X, v[1] - Y) < Math.hypot(F[0] - X, F[1] - Y)) F = v; });
    function at(s, t) {                     // shrunk to s towards F, then moved the share t of the way into the corner
      var P = V.map(function (v) { return [F[0] + s * (v[0] - F[0]), F[1] + s * (v[1] - F[1])]; });
      var xs = P.map(function (q) { return q[0]; }), ys = P.map(function (q) { return q[1]; });
      var mx = Math.max(0, left ? Math.min.apply(null, xs) - PHOTO_EDGE : W - PHOTO_EDGE - Math.max.apply(null, xs));
      var my = Math.max(0, top ? Math.min.apply(null, ys) - PHOTO_EDGE : H - PHOTO_EDGE - Math.max.apply(null, ys));
      return P.map(function (q) { return [q[0] + (left ? -mx : mx) * t, q[1] + (top ? -my : my) * t]; });
    }
    function clear(s, t) {
      var P = at(s, t);
      return shapes.every(function (q) { return polyGap(P, q) >= PHOTO_GAP; });
    }
    // Binary search between a value known to work (good) and one that doesn't (bad).
    function closest(good, bad, ok) {
      for (var i = 0; i < 10; i++) { var mid = (good + bad) / 2; if (ok(mid)) good = mid; else bad = mid; }
      return good;
    }
    var s = 1, t = 0;
    if (!clear(1, 0)) {
      if (clear(1, 1)) t = closest(1, 0, function (v) { return clear(1, v); });            // the least move that clears
      else if (clear(PHOTO_MIN, 1)) { s = closest(PHOTO_MIN, 1, function (v) { return clear(v, 1); }); t = 1; }
      else return { s: 0 };
    }
    var P = at(s, t);
    return { s: s, cx: (P[0][0] + P[2][0]) / 2 / W, cy: (P[0][1] + P[2][1]) / 2 / H };
  }

  function placePhotos() {
    var any = false, k = photoScale();
    var shapes = state.started && !state.flat ? wordShapes() : null;   // while editing, show the layout exactly as set
    photoEls.forEach(function (e) {
      var p = e.p, g = { s: 1, cx: p.cx, cy: p.cy };
      if (p.show) {
        any = true;
        if (shapes) g = fitPhoto(p, p.w * k * cardBox.w, shapes);
      }
      e.fit = g.s;
      e.fig.hidden = !p.show || !g.s;
      if (!e.fig.hidden) {
        e.fig.style.left = (g.cx * 100) + '%';
        e.fig.style.top = (g.cy * 100) + '%';
        e.fig.style.width = (p.w * k * g.s * 100) + '%';
      }
      e.base = 'translate(-50%, -50%) rotate(' + p.r + 'deg)';
      e.shown = -1;                         // apply the new transform on the next frame
    });
    ui.card.classList.toggle('has-photos', any);
  }
  buildPhotos();
  ui.cRule.innerHTML = '<svg viewBox="0 0 96 10" aria-hidden="true" focusable="false"><path class="r-line" d="M2 5H37M59 5H94"/>' +
    '<circle class="r-orn" cx="41" cy="5" r="1"/><circle class="r-orn" cx="55" cy="5" r="1"/><path class="r-orn" d="M48 1.4L51.6 5 48 8.6 44.4 5z"/></svg>';

  // ---------- Drawing each frame ----------
  var shown = {}, lastBorder = -1, lastQuad = '', paperOk = false;
  function setOpacity(id, a) {
    var v = Math.round(a * 1000) / 1000;
    if (shown[id] === v) return;
    shown[id] = v;
    ui[id].style.opacity = v;
  }
  function filmTime() {
    if (state.phase === 'ended') return END;
    var t = video.currentTime || 0;
    if (!video.paused && state.frameT >= 0 && Math.abs(state.frameT - t) < 0.2) t = state.frameT;
    return t;
  }
  function render(now) {
    var t = filmTime(), playing = state.phase === 'playing';
    var gain = smooth((now - state.startT) / 900);
    var dg = state.doorUntil ? smooth((now - state.doorUntil) / 700) : 1;     // the titles wait for the doors
    var a1 = playing ? fade(t, FADES.introNames) * gain * dg : 0, a2 = playing ? fade(t, FADES.introLine) * dg : 0;
    setOpacity('introNames', a1);
    setOpacity('introLine', a2);
    ui.intro.style.setProperty('--scrim', Math.max(a1, a2).toFixed(3));

    var f = t * FILM.fps;
    paperOk = state.started && f >= FILM.paper.first - 0.5;
    if (paperOk) {
      var key = (state.flat ? 'flat' : f.toFixed(2)) + '|' + state.layoutV + '|' + ui.stage.clientWidth + 'x' + ui.stage.clientHeight;
      if (key !== lastQuad) {
        lastQuad = key;
        ui.paper.style.transform = state.flat ? flatTransform() : cssMatrix(homography(PW, PH, toScreen(quadAt(f), cover())));
      }
    }
    for (var i = 0; i < CARD_IDS.length; i++) setOpacity(CARD_IDS[i], paperOk ? fade(t, FADES[CARD_IDS[i]]) : 0);
    for (var k = 0; k < photoEls.length; k++) {
      var pe = photoEls[k], pa = paperOk ? Math.round(fade(t, PHOTO_FADES[k % PHOTO_FADES.length]) * 1000) / 1000 : 0;
      if (pe.shown !== pa) {
        pe.shown = pa;
        pe.fig.style.opacity = pa;
        pe.fig.style.transform = pe.base + ' scale(' + (1.06 - 0.06 * pa).toFixed(3) + ')';   // settles onto the paper
      }
    }
    var b = paperOk ? Math.round(fade(t, FADES.border) * 1000) / 1000 : 0;
    if (b !== lastBorder) {
      lastBorder = b;
      for (var j = 0; j < borderPaths.length; j++) borderPaths[j].style.strokeDashoffset = borderLens[j] * (1 - b);
      if (borderOrn) borderOrn.style.opacity = smooth((b - 0.75) / 0.25);
    }
    if (state.review) {
      ui.rvTime.textContent = t.toFixed(1) + ' / ' + END.toFixed(1) + ' s';
      if (!state.scrubbing) ui.rvScrub.value = t;
      ui.rvPlay.textContent = video.paused || state.phase === 'ended' ? 'Play' : 'Pause';
    }
  }

  function updateUI() {
    var on = state.started, ph = state.phase;
    show(ui.langBtn, on);
    show(ui.soundBtn, on);                    // the music carries on after the film, so it can always be muted
    show(ui.reviewBtn, on && reviewEnabled);
    show(ui.replyChip, on && ph === 'playing');
    show(ui.skipBtn, on && ph === 'playing');
    show(ui.replayBtn, on && ph === 'ended');
    ui.replayBtn.textContent = state.reduced && !state.playedOnce ? STR[state.lang].play : STR[state.lang].replay;
    ui.endActions.classList.toggle('show', on && ph === 'ended');
    // don't strand keyboard focus on a button that just disappeared
    var a = document.activeElement;
    if (a && a !== document.body && ui.topbar.contains(a) && a.hidden) (ph === 'ended' ? ui.replyBtn : ui.skipBtn).focus();
  }

  var raf = 0;
  function kick() { if (!raf) raf = requestAnimationFrame(tick); }
  function tick(now) {
    raf = 0;
    render(now);
    if ((state.phase === 'playing' && !video.paused) || now - state.startT < 1000) raf = requestAnimationFrame(tick);
  }
  if ('requestVideoFrameCallback' in HTMLVideoElement.prototype) {
    var onFrame = function (now, meta) { state.frameT = meta.mediaTime; video.requestVideoFrameCallback(onFrame); };
    video.requestVideoFrameCallback(onFrame);
  }

  // ---------- Music ----------
  // The film itself is always muted; the music is the soundtrack. It starts with the guest's tap on a
  // language (browsers only allow sound after a tap), loops, and keeps going after the film ends.
  var music = ui.music;
  function renderSound() {
    var s = STR[state.lang], on = state.soundOn;
    ui.soundBtn.innerHTML = on ? ICON_SOUND : ICON_MUTED;
    ui.soundBtn.setAttribute('aria-label', on ? s.soundOff : s.soundOn);
  }
  function startMusic() {
    if (!state.soundOn) return;
    if (!music.getAttribute('src')) music.src = MUSIC_SRC;
    var p = music.play();
    if (p && p.catch) {
      p.catch(function (err) {
        if (err && err.name === 'AbortError') return;
        state.soundOn = false;      // not allowed without a tap (e.g. an edit link), or no music file here
        renderSound();
      });
    }
  }
  function setSound(on) {
    state.soundOn = on;
    renderSound();
    if (on) startMusic(); else music.pause();
  }
  document.addEventListener('visibilitychange', function () {   // pause while the guest is in another app or tab
    if (document.hidden) {
      if (!music.paused) { state.musicAway = true; music.pause(); }
    } else if (state.musicAway) {
      state.musicAway = false;
      startMusic();
    }
  });

  // ---------- The entrance: glass doors in front of the film (media/door, made by tools/build_door.py) ----------
  // While the language screen is up, the film's first frame shows through the doors' glass. Choosing a language
  // swings the doors in, the camera moves through the doorway, and the film starts on the way in; its opening
  // titles wait until the doors are through. Links that skip the language screen skip the doors too.
  var DOOR = window.DOOR || null;
  var DOOR_OPEN_DEG = 78;       // how far each door swings in
  var DOOR_SWING_MS = 1900;     // the swing
  var DOOR_PUSH_DELAY = 550;    // the camera starts moving while the doors open...
  var DOOR_PUSH_MS = 2100;      // ...and passes through the doorway in this time
  var DOOR_FILM_AT = 800;       // the film starts this long after the tap
  var door = { ready: false, anims: [], timers: [], push: 3 };

  function loadDoor() {
    if (!DOOR || !ui.doorCam.animate) return;
    document.documentElement.classList.add('door-on');
    var w = DOOR.x1 - DOOR.x0, split = (DOOR.mid - DOOR.x0) / w * 100, s = ui.doorWay.style;
    s.left = (DOOR.x0 / DOOR.w * 100) + '%';
    s.top = (DOOR.y0 / DOOR.h * 100) + '%';
    s.width = (w / DOOR.w * 100) + '%';
    s.height = ((DOOR.y1 - DOOR.y0) / DOOR.h * 100) + '%';
    ui.doorL.style.width = split + '%';
    ui.doorR.style.left = split + '%';
    ui.doorR.style.width = (100 - split) + '%';
    ui.doorBackdrop.style.backgroundImage = 'url(media/door/door-backdrop.jpg)';
    show(ui.door, true);
    layoutDoor();
    Promise.all([[ui.doorPic, 'door-scene.webp'], [ui.doorL, 'door-left.webp'], [ui.doorR, 'door-right.webp']].map(function (p) {
      return new Promise(function (ok, bad) {
        p[0].onload = ok;
        p[0].onerror = bad;
        p[0].src = 'media/door/' + p[1];
        if (p[0].complete && p[0].naturalWidth) ok();
      });
    })).then(function () {
      if (state.started) return;              // the guest chose a language before the doors arrived
      door.ready = true;
      ui.door.classList.add('ready');
    }, function () {                          // no doors: the language screen goes back to its plain look
      doorGone();
      document.documentElement.classList.remove('door-on');
    });
  }
  // Phones: the picture fills the screen. Wider screens: it fills the height, with a soft backdrop either side.
  function layoutDoor() {
    if (!DOOR || ui.door.hidden) return;
    var W = ui.stage.clientWidth || window.innerWidth, H = ui.stage.clientHeight || window.innerHeight;
    var fill = W / H <= 0.66, k = fill ? Math.max(W / DOOR.w, H / DOOR.h) : H / DOOR.h;
    var sw = DOOR.w * k, sh = DOOR.h * k, left = (W - sw) / 2, top = (H - sh) / 2, st = ui.doorScene.style;
    st.left = left + 'px'; st.top = top + 'px'; st.width = sw + 'px'; st.height = sh + 'px';
    ui.door.classList.toggle('wide', !fill);
    var mask = fill ? '' : 'linear-gradient(90deg, #000 ' + left.toFixed(1) + 'px, transparent ' + left.toFixed(1) +
      'px, transparent ' + (left + sw).toFixed(1) + 'px, #000 ' + (left + sw).toFixed(1) + 'px)';
    ui.doorBackdrop.style.webkitMaskImage = mask;    // the backdrop only fills the sides, so the glass still shows the film
    ui.doorBackdrop.style.maskImage = mask;
    var dl = left + DOOR.x0 * k, dt = top + DOOR.y0 * k, w = (DOOR.x1 - DOOR.x0) * k, h = (DOOR.y1 - DOOR.y0) * k;
    ui.doorWay.style.perspective = Math.round(h * 1.9) + 'px';
    // The camera heads for the middle of the doorway's straight part, far enough for the doorway to fill the screen.
    var spring = dt + w / 2, ox = dl + w / 2, oy = spring + (dt + h - spring) / 2;
    ui.doorCam.style.transformOrigin = ox.toFixed(1) + 'px ' + oy.toFixed(1) + 'px';
    door.push = 1.05 * Math.max(Math.max(ox, W - ox) / (w / 2), oy / (oy - spring), (H - oy) / (dt + h - oy));
  }
  function openDoor() {
    var swing = { duration: DOOR_SWING_MS, easing: 'cubic-bezier(.45, 0, .2, 1)', fill: 'forwards' };
    door.anims = [
      ui.doorL.animate([{ transform: 'rotateY(0deg)' }, { transform: 'rotateY(' + DOOR_OPEN_DEG + 'deg)' }], swing),
      ui.doorR.animate([{ transform: 'rotateY(0deg)' }, { transform: 'rotateY(' + -DOOR_OPEN_DEG + 'deg)' }], swing),
      ui.doorCam.animate([
        { transform: 'scale(1)', opacity: 1, offset: 0 },
        { transform: 'scale(' + (1 + (door.push - 1) / 2).toFixed(3) + ')', opacity: 1, offset: 0.5 },
        { transform: 'scale(' + door.push.toFixed(3) + ')', opacity: 0, offset: 1 }
      ], { duration: DOOR_PUSH_MS, delay: DOOR_PUSH_DELAY, easing: 'cubic-bezier(.5, 0, .75, .8)', fill: 'forwards' })
    ];
    state.doorUntil = performance.now() + DOOR_PUSH_DELAY + DOOR_PUSH_MS - 250;
    door.timers.push(setTimeout(playFromStart, DOOR_FILM_AT));
    door.timers.push(setTimeout(doorGone, DOOR_PUSH_DELAY + DOOR_PUSH_MS + 50));
  }
  // Through the doors, or not wanted (skipped, reduced motion, a link straight to the card): stop and hide them.
  function doorGone() {
    door.timers.forEach(clearTimeout);
    door.timers = [];
    door.anims.forEach(function (a) { a.cancel(); });
    door.anims = [];
    show(ui.door, false);
  }
  // "Watch again": back to the closed doors, which open again by themselves.
  function replay() {
    if (!door.ready || state.reduced) { state.doorUntil = 0; playFromStart(); return; }
    doorGone();
    if (!video.paused) { state.ownPause = true; video.pause(); }
    state.phase = 'door';
    shown = {};
    ui.finalImg.hidden = true;
    ui.posterImg.classList.remove('gone');
    show(ui.resumeBtn, false);
    if (video.currentTime > 0) video.currentTime = 0;
    show(ui.door, true);
    layoutDoor();
    lastQuad = '';
    updateUI();
    kick();
    door.timers.push(setTimeout(openDoor, 500));
  }

  // ---------- Playback ----------
  function playFromStart() {
    state.phase = 'playing';
    state.playedOnce = true;
    state.startT = performance.now();
    shown = {};
    ui.finalImg.hidden = true;
    show(ui.resumeBtn, false);
    if (video.currentTime > 0) video.currentTime = 0;
    video.preload = 'auto';
    video.muted = true;            // the music is the soundtrack; a muted film may always play
    var p = video.play();
    if (p && p.catch) {
      p.catch(function (err) {     // e.g. a phone's low-power mode: offer a button
        if (state.phase !== 'playing' || (err && err.name === 'AbortError')) return;   // e.g. skipped
        show(ui.resumeBtn, true);
      });
    }
    updateUI();
    kick();
  }
  function showEnd() {
    doorGone();
    state.phase = 'ended';
    ui.finalImg.hidden = false;
    ui.posterImg.classList.add('gone');
    show(ui.resumeBtn, false);
    show(ui.buffering, false);
    lastQuad = '';
    updateUI();
    render(performance.now());
  }
  function skipToEnd() {
    if (!video.paused) { state.ownPause = true; video.pause(); }
    showEnd();
  }

  video.addEventListener('playing', function () {
    ui.posterImg.classList.add('gone');
    show(ui.buffering, false);
    show(ui.resumeBtn, false);
    kick();
  });
  var waitTimer = 0;
  video.addEventListener('waiting', function () {
    clearTimeout(waitTimer);
    waitTimer = setTimeout(function () { if (state.phase === 'playing' && !video.paused && video.readyState < 3) show(ui.buffering, true); }, 400);
  });
  video.addEventListener('canplay', function () { clearTimeout(waitTimer); show(ui.buffering, false); });
  video.addEventListener('pause', function () {
    if (state.ownPause || video.ended || state.review || state.phase !== 'playing') { state.ownPause = false; return; }
    show(ui.resumeBtn, true);   // e.g. the phone paused it when the guest switched apps
  });
  video.addEventListener('ended', function () { if (state.phase === 'playing') showEnd(); });
  video.addEventListener('seeked', kick);
  video.addEventListener('loadeddata', kick);
  video.addEventListener('loadedmetadata', function () {
    if (!state.started && !state.gateMsg) ui.loadStatus.textContent = STR.en.ready;
  });
  video.addEventListener('error', function () {
    if (!state.started) return;
    toast(STR[state.lang].filmError);
    showEnd();
  });

  // ---------- Language ----------
  function fillCard(s) {
    ui.cNames.textContent = '';
    ui.cNames.setAttribute('aria-label', s.namesLabel);
    s.names.forEach(function (part, i) {
      var span = el('span', i === 1 ? 'amp' : '');
      span.textContent = part;
      ui.cNames.appendChild(span);
    });
    ui.cRequest.textContent = '';
    ui.cRequest.appendChild(document.createTextNode(s.request[0]));
    ui.cRequest.appendChild(el('br'));
    ui.cRequest.appendChild(document.createTextNode(s.request[1]));
    ui.cDay.textContent = s.day; ui.cNum.textContent = s.num; ui.cMonth.textContent = s.month;
    ui.cPlace.textContent = s.place;
    ui.cDetails.textContent = s.details;
    ui.cRsvp.textContent = ui.card.classList.contains('has-photos') ? s.rsvpLineStacked : s.rsvpLine;
  }
  function applyLang(lang) {
    var s = STR[lang];
    state.lang = lang;
    document.documentElement.lang = s.htmlLang;
    ui.sceneDesc.textContent = s.scene;
    ui.introNames.textContent = s.introNames;
    ui.introLine.textContent = s.introLine;
    fillCard(s);
    photoEls.forEach(function (e) { e.img.alt = e.p[lang] || ''; });
    ui.skipBtn.textContent = s.skip;
    ui.replyChip.textContent = s.replyChip;
    ui.resumeBtn.textContent = s.resume;
    updateNote();
    ui.langBtn.textContent = s.langBtn;
    ui.langBtn.setAttribute('aria-label', s.langLabel);
    ui.langBtn.setAttribute('lang', lang === 'en' ? 'zh-Hans' : 'en');
    renderSound();
    renderReply();
    if (state.started) layoutCard();
    updateUI();
    kick();
  }

  // ---------- Start ----------
  function begin(lang, at) {
    if (state.started) return;
    state.started = true;
    startMusic();                             // first, while still inside the guest's tap
    state.reduced = ui.reduceMotion.checked;
    document.documentElement.classList.toggle('reduced', state.reduced);
    ui.gate.classList.add('hide');
    ui.gate.setAttribute('aria-hidden', 'true');
    applyLang(lang);
    if (typeof at === 'number' && at >= END - 0.02) {   // straight to the finished card (review or edit link)
      showEnd();
    } else if (typeof at === 'number') {      // review link: open paused at a moment
      video.preload = 'auto';
      seekTo(at);
    } else if (state.reduced) {
      showEnd();
    } else if (door.ready) {                  // through the doors; the film starts on the way in
      state.phase = 'door';
      openDoor();
    } else {
      doorGone();
      playFromStart();
    }
    try { ui.cNames.focus({ preventScroll: true }); } catch (e) { ui.cNames.focus(); }
    updateUI();
    kick();
  }

  // ---------- Reply form ----------
  function errorText(key) { return key ? STR[state.lang][key] : ''; }
  function renderPeople() {
    var s = STR[state.lang], box = ui.people;
    box.textContent = '';
    reply.people.forEach(function (p, i) {
      var nameId = 'pname-' + i, attId = 'att-' + i;
      var row = el('div', 'person');
      row.setAttribute('role', 'group');
      row.setAttribute('aria-labelledby', 'ptitle-' + i);
      var head = el('div', 'person-head');
      var title = el('p', 'person-title');
      title.id = 'ptitle-' + i;
      title.textContent = s.guest + ' ' + (i + 1);
      head.appendChild(title);
      if (i > 0) {
        var rm = el('button', 'btn-remove');
        rm.type = 'button';
        rm.innerHTML = ICON_X;
        var rmText = el('span');
        rmText.textContent = s.remove;
        rm.appendChild(rmText);
        rm.setAttribute('aria-label', s.remove + ' · ' + (p.name.trim() || s.guest + ' ' + (i + 1)));
        rm.addEventListener('click', function () { removePerson(i); });
        head.appendChild(rm);
      }
      row.appendChild(head);

      var nameErr = el('p', 'field-error');
      nameErr.id = nameId + '-err';
      nameErr.textContent = errorText(reply.errors[nameId]);
      nameErr.hidden = !reply.errors[nameId];
      var label = el('label', 'field-label');
      label.htmlFor = nameId;
      label.textContent = s.guestName;
      var input = el('input', 'input');
      input.id = nameId; input.type = 'text'; input.maxLength = 80;
      input.autocomplete = i === 0 ? 'name' : 'off';
      input.setAttribute('autocapitalize', 'words');
      input.spellcheck = false;
      input.value = p.name;
      input.setAttribute('aria-describedby', nameErr.id);
      if (reply.errors[nameId]) input.setAttribute('aria-invalid', 'true');
      input.addEventListener('input', function () {
        p.name = input.value;
        if (reply.errors[nameId]) { delete reply.errors[nameId]; input.removeAttribute('aria-invalid'); nameErr.hidden = true; }
      });
      row.appendChild(label); row.appendChild(input); row.appendChild(nameErr);

      var attErr = el('p', 'field-error');
      attErr.id = attId + '-err';
      attErr.textContent = errorText(reply.errors[attId]);
      attErr.hidden = !reply.errors[attId];
      var group = el('fieldset', 'attend' + (reply.errors[attId] ? ' invalid' : ''));
      var legend = el('legend', 'sr-only');
      legend.textContent = s.attendance + ' · ' + s.guest + ' ' + (i + 1);
      group.appendChild(legend);
      ['attending', 'declining'].forEach(function (val) {
        var pill = el('label', 'pill');
        var radio = el('input');
        radio.type = 'radio'; radio.name = attId; radio.value = val; radio.id = attId + '-' + val;
        radio.checked = p.att === val;
        radio.setAttribute('aria-describedby', attErr.id);
        radio.addEventListener('change', function () {
          p.att = val;
          if (reply.errors[attId]) { delete reply.errors[attId]; group.classList.remove('invalid'); attErr.hidden = true; }
        });
        var text = el('span');
        text.textContent = val === 'attending' ? s.attend : s.decline;
        pill.appendChild(radio); pill.appendChild(text);
        group.appendChild(pill);
      });
      row.appendChild(group); row.appendChild(attErr);
      box.appendChild(row);
    });
    ui.addPerson.disabled = reply.people.length >= MAX_PEOPLE;
    show(ui.maxNote, reply.people.length >= MAX_PEOPLE);
  }
  function addPerson() {
    if (reply.people.length >= MAX_PEOPLE) return;
    reply.people.push({ name: '', att: '' });
    renderPeople();
    $('pname-' + (reply.people.length - 1)).focus();
  }
  function removePerson(i) {
    reply.people.splice(i, 1);
    reply.errors = {};
    show(ui.errorSummary, false);
    renderPeople();
    ($('pname-' + Math.min(i, reply.people.length - 1)) || ui.addPerson).focus();
  }
  function renderSummary(list) {
    var s = STR[state.lang];
    list.textContent = '';
    reply.people.forEach(function (p) {
      var li = el('li', p.att);
      var who = el('span', 'sum-name'); who.textContent = p.name;
      var what = el('span', 'sum-choice'); what.textContent = p.att === 'attending' ? s.attend : s.decline;
      li.appendChild(who); li.appendChild(what);
      list.appendChild(li);
    });
  }
  function sgTime(isoStr) {
    try {
      return new Intl.DateTimeFormat(state.lang === 'zh' ? 'zh-CN' : 'en-SG', {
        timeZone: 'Asia/Singapore', year: 'numeric', month: state.lang === 'zh' ? 'long' : 'short',
        day: 'numeric', hour: 'numeric', minute: '2-digit'
      }).format(new Date(isoStr));
    } catch (e) { return isoStr; }
  }
  function doneNextText(s, email) {
    if (!reply.savedAt) return email ? fmt(s.doneEmail, { email: email }) : s.doneNoEmail;   // preview: nothing was saved
    if (reply.emailState === 'queued') return fmt(s.doneEmailLive, { email: reply.emailTo });
    var after = reply.kind === 'email' ? s.doneLinkAgain : reply.kind === 'organizer' ? s.doneOrganizer : s.doneNoEmailLive;
    return reply.emailState === 'failed' ? s.doneEmailFailed + ' ' + after : after;
  }
  function renderNotice(s) {
    var k = reply.notice;
    if (!k) return;
    ui.noticeTitle.textContent = s[k + 'Title'];
    ui.noticeText.textContent = s[k + 'Text'];
    show(ui.noticeList, k === 'editsClosed');
    if (k === 'editsClosed') renderSummary(ui.noticeList);
    ui.noticeClose.textContent = s.close;
  }
  function renderReply() {
    var s = STR[state.lang], email = ui.email.value.trim(), editing = reply.mode === 'edit', saved = !!reply.savedAt;
    ui.rsvpLang.textContent = s.dialogLang;
    ui.rsvpLang.setAttribute('aria-label', s.langLabel);
    ui.rsvpLang.setAttribute('lang', state.lang === 'en' ? 'zh-Hans' : 'en');
    ui.rsvpClose.setAttribute('aria-label', s.close);
    ui.rsvpEyebrow.textContent = s.formEyebrow;
    ui.rsvpTitle.textContent = editing ? s.formTitleEdit : s.formTitle;
    ui.rsvpIntro.textContent = editing ? s.formIntroEdit : s.formIntro;
    ui.errorSummary.textContent = s.errSummary;
    ui.addPerson.textContent = s.add;
    ui.maxNote.textContent = fmt(s.maxNote, { max: MAX_PEOPLE });
    ui.emailLabel.textContent = s.emailLabel;
    ui.emailNote.textContent = s.emailNote;
    ui.emailError.textContent = errorText(reply.errors.email);
    ui.toReview.textContent = s.toReview;
    ui.reviewTitle.textContent = s.reviewTitle;
    ui.reviewEmail.textContent = email ? fmt(s.reviewEmail, { email: email }) : s.reviewNoEmail;
    ui.privacyNote.textContent = s.privacy;
    ui.backToEdit.textContent = s.back;
    ui.saveBtn.textContent = reply.saving ? s.saving : s.save;
    ui.saveBtn.disabled = ui.backToEdit.disabled = reply.saving;
    ui.rsvpReview.setAttribute('aria-busy', reply.saving ? 'true' : 'false');
    ui.saveError.textContent = reply.saveError ? fmt(s[reply.saveError], { max: MAX_PEOPLE }) : '';
    show(ui.saveError, !!reply.saveError);
    ui.doneBanner.textContent = s.doneBanner;
    show(ui.doneBanner, !saved);
    ui.doneTitle.textContent = s.doneTitle;
    ui.doneLead.textContent = !saved ? s.doneLead : reply.wasNew ? s.doneLeadSaved : s.doneLeadUpdated;
    ui.doneMeta.textContent = saved ? fmt(s.doneMeta, { time: sgTime(reply.savedAt), ref: reply.id }) : '';
    show(ui.doneMeta, saved);
    ui.doneNext.textContent = doneNextText(s, email);
    ui.editAgain.textContent = s.editAgain;
    ui.doneClose.textContent = s.close;
    ui.replyBtn.textContent = reply.id ? s.replyEdit : s.reply;
    renderNotice(s);
    renderPeople();
    renderSummary(ui.reviewList);
    renderSummary(ui.doneList);
  }
  function showView(view) {
    reply.view = view;
    show(ui.rsvpForm, view === 'form');
    show(ui.rsvpReview, view === 'review');
    show(ui.rsvpDone, view === 'done');
    show(ui.rsvpNotice, view === 'notice');
    var title = { form: ui.rsvpTitle, review: ui.reviewTitle, done: ui.doneTitle, notice: ui.noticeTitle }[view];
    ui.rsvpSheet.setAttribute('aria-labelledby', title.id);
    ui.rsvpSheet.scrollTop = 0;
    title.focus();
  }
  ui.rsvpForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var errs = {}, first = null;
    reply.people.forEach(function (p, i) {
      p.name = p.name.replace(/\s+/g, ' ').trim();
      if (!p.name) { errs['pname-' + i] = 'errName'; first = first || 'pname-' + i; }
      if (!p.att) { errs['att-' + i] = 'errAttend'; first = first || 'att-' + i + '-attending'; }
    });
    ui.email.value = ui.email.value.trim();
    if (ui.email.value && !ui.email.checkValidity()) { errs.email = 'errEmail'; first = first || 'email'; }
    reply.errors = errs;
    renderReply();
    show(ui.emailError, !!errs.email);
    if (errs.email) ui.email.setAttribute('aria-invalid', 'true'); else ui.email.removeAttribute('aria-invalid');
    show(ui.errorSummary, !!first);
    if (first) { $(first).focus(); return; }
    reply.idemKey = newKey();        // one key per reviewed version, so a retried save is recognised as the same save
    reply.saveError = '';
    renderReply();
    showView('review');
  });
  ui.email.addEventListener('input', function () {
    if (reply.errors.email) { delete reply.errors.email; ui.email.removeAttribute('aria-invalid'); show(ui.emailError, false); }
  });
  ui.addPerson.addEventListener('click', addPerson);
  ui.backToEdit.addEventListener('click', function () { showView('form'); });
  ui.saveBtn.addEventListener('click', saveReply);
  ui.editAgain.addEventListener('click', function () { reply.saveError = ''; renderReply(); showView('form'); });
  ui.noticeClose.addEventListener('click', closeReply);
  ui.doneClose.addEventListener('click', closeReply);
  ui.rsvpClose.addEventListener('click', closeReply);
  ui.rsvpBackdrop.addEventListener('click', closeReply);
  ui.rsvpLang.addEventListener('click', function () { applyLang(state.lang === 'en' ? 'zh' : 'en'); ui.rsvpLang.focus(); });

  var INERT = 'inert' in HTMLElement.prototype, lastFocus = null;
  function setInert(on) {
    ['stage', 'paperLayer', 'ui', 'review'].forEach(function (id) {
      var n = ui[id];
      if (INERT) n.inert = on;
      else if (id !== 'stage') { if (on) n.setAttribute('aria-hidden', 'true'); else n.removeAttribute('aria-hidden'); }
    });
  }
  function openReply() {
    lastFocus = document.activeElement;
    renderReply();
    ui.rsvp.hidden = false;
    setInert(true);
    requestAnimationFrame(function () { ui.rsvp.classList.add('open'); });
    showView(reply.view);
    if (!reply.id && reply.view === 'form') {          // first-time replies may have closed
      apiStatus().then(function (st) {
        if (st && st.firstRepliesOpen === false && !reply.id && reply.view === 'form' && !ui.rsvp.hidden) {
          reply.notice = 'closed';
          renderReply();
          showView('notice');
        }
      });
    }
  }
  function closeReply() {
    ui.rsvp.classList.remove('open');
    setInert(false);
    setTimeout(function () { if (!ui.rsvp.classList.contains('open')) ui.rsvp.hidden = true; }, state.reduced ? 0 : 280);
    (lastFocus && lastFocus.offsetParent ? lastFocus : ui.replyBtn).focus();
  }
  ui.rsvp.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { e.preventDefault(); closeReply(); return; }
    if (e.key !== 'Tab' || INERT) return;
    var f = Array.prototype.filter.call(ui.rsvpSheet.querySelectorAll('button, input, [tabindex="-1"]'), function (n) {
      return n.offsetParent && !n.disabled && n.tabIndex >= 0;
    });
    if (!f.length) return;
    if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
    else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
  });

  // ---------- Saving replies (when the page is served by the reply server in ../backend) ----------
  var api = { base: location.protocol === 'file:' ? null : 'api/', status: null, pending: null };

  function newKey() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    var b = new Uint8Array(16);
    crypto.getRandomValues(b);
    return Array.prototype.map.call(b, function (x) { return (x + 256).toString(16).slice(1); }).join('');
  }
  function request(method, path, body, token) {
    var ctl = window.AbortController ? new AbortController() : null;
    var timer = ctl ? setTimeout(function () { ctl.abort(); }, 20000) : 0;
    var headers = { Accept: 'application/json' };
    if (body) headers['Content-Type'] = 'application/json';
    if (token) headers.Authorization = 'Bearer ' + token;
    return fetch(api.base + path, {
      method: method, headers: headers, body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer', signal: ctl ? ctl.signal : undefined
    }).then(function (res) {
      clearTimeout(timer);
      return res.text().then(function (t) {
        var j = null;
        try { j = JSON.parse(t); } catch (e) { /* not JSON: no reply server here */ }
        return { status: res.status, ok: res.ok, json: j };
      });
    }, function (err) { clearTimeout(timer); throw err; });
  }
  // Resolves to the server's settings, to {none: true} when there is no reply server (opened from disk or
  // from a plain file server), or to null when the connection failed (asked again next time).
  function apiStatus() {
    if (!api.base) return Promise.resolve({ none: true });
    if (api.status) return Promise.resolve(api.status);
    if (!api.pending) {
      api.pending = request('GET', 'status').then(function (r) {
        var before = MAX_PEOPLE;
        api.status = r.json && r.json.ok ? r.json : { none: true };
        if (api.status.maxPeople) MAX_PEOPLE = api.status.maxPeople;
        updateNote();
        updateEmailField();
        if (MAX_PEOPLE !== before) renderReply();
        return api.status;
      }, function () { return null; }).then(function (v) { api.pending = null; return v; });
    }
    return api.pending;
  }
  // The optional email field shows only where email copies can actually be sent (or in the preview).
  function updateEmailField() {
    var off = !!(api.status && api.status.emailCopies === false);
    if (off) { ui.email.value = ''; delete reply.errors.email; }
    show(ui.emailBlock, !off);
  }
  function updateNote() {
    var s = STR[state.lang], st = api.status;
    var text = st ? (st.none ? s.note : st.environment === 'development' ? s.noteTest : '') : (api.base ? '' : s.note);
    ui.placeholderNote.textContent = text;
    show(ui.placeholderNote, !!text);
  }
  function applyLoaded(data) {
    var rp = data.reply;
    reply.mode = 'edit';
    reply.id = rp.id;
    reply.revision = rp.revision;
    reply.people = rp.people.map(function (p) { return { id: p.id, name: p.name, att: p.attending ? 'attending' : 'declining' }; });
    if (data.access) { reply.kind = data.access.kind; reply.canEdit = data.access.canEdit; }
    reply.errors = {};
  }
  function errorFor(r) {
    var code = r.json && r.json.error;
    if (r.status === 429) return 'errBusy';
    if (code === 'too_many_people') return 'errTooMany';
    if (code === 'conflict') return 'errConflict';
    if (code === 'invalid_link') return reply.kind === 'session' ? 'errLinkExpired' : 'errLinkInvalid';
    if (code === 'edits_closed') return 'errEditsClosed';
    if (code === 'replies_closed') return 'errRepliesClosed';
    if (r.status >= 400 && r.status < 500) return 'errInvalid';
    return 'errServer';
  }
  function onSaved(data, email, wasNew) {
    applyLoaded(data);
    reply.savedAt = data.reply.updatedAt;
    if (data.session) { reply.token = data.session.token; reply.kind = 'session'; }
    reply.wasNew = wasNew;
    reply.emailTo = data.email && data.email.requested ? email : '';
    reply.emailState = data.email ? data.email.status : 'none';
    reply.saving = false;
    reply.saveError = '';
    ui.email.value = '';             // the address isn't kept; typing it again sends a fresh copy
    renderReply();
    showView('done');
  }
  function failSave(key) {
    reply.saving = false;
    reply.saveError = key;
    renderReply();
    if (key === 'errConflict' && reply.token) {        // show the latest version so the changes can be made again
      request('GET', 'replies/current', null, reply.token).then(function (res) {
        if (res.ok && res.json && res.json.ok) { applyLoaded(res.json); renderReply(); }
      }, function () {});
    }
  }
  function saveReply() {
    if (reply.saving) return;
    reply.saving = true;
    reply.saveError = '';
    if (!reply.idemKey) reply.idemKey = newKey();
    renderReply();
    apiStatus().then(function (st) {
      if (st && st.none) {           // no reply server: preview only, nothing is sent or stored
        reply.saving = false;
        renderReply();
        showView('done');
        return;
      }
      var email = ui.email.value.trim(), editing = reply.mode === 'edit' && !!reply.token;
      var body = {
        idempotencyKey: reply.idemKey, lang: state.lang, website: ui.website.value,
        people: reply.people.map(function (p) {
          var o = { name: p.name, attending: p.att === 'attending' };
          if (p.id) o.id = p.id;
          return o;
        })
      };
      if (email) body.email = email;
      if (editing) body.revision = reply.revision;
      return request(editing ? 'PUT' : 'POST', editing ? 'replies/current' : 'replies', body, editing ? reply.token : null)
        .then(function (r) {
          if (r.ok && r.json && r.json.ok) onSaved(r.json, email, !editing);
          else failSave(errorFor(r));
        });
    }).catch(function () { failSave('errNetwork'); });
  }
  // A private edit link: load the reply, skip the film, open the form (or a read-only view after 17 June).
  function openFromLink(token) {
    state.gateMsg = true;
    ui.loadStatus.textContent = GATE.opening;
    request('GET', 'replies/current', null, token).then(function (r) {
      if (!(r.ok && r.json && r.json.ok)) {
        ui.loadStatus.textContent = r.status === 401 ? GATE.linkInvalid : GATE.linkError;
        return;
      }
      reply.token = token;
      applyLoaded(r.json);
      reply.notice = reply.canEdit ? '' : 'editsClosed';
      reply.view = reply.canEdit ? 'form' : 'notice';
      begin(r.json.reply.lang === 'zh' ? 'zh' : 'en', END);
      openReply();
    }, function () { ui.loadStatus.textContent = GATE.linkError; });
  }

  // ---------- Review tools (?review=1) ----------
  function setReview(on) {
    state.review = on;
    show(ui.review, on);
    document.body.classList.toggle('review-open', on);
    ui.reviewBtn.setAttribute('aria-expanded', String(on));
    ui.rvScrub.max = END;
    kick();
  }
  SHOTS.forEach(function (shot) {
    var b = el('button');
    b.type = 'button';
    b.textContent = shot[0];
    b.addEventListener('click', function () { seekTo(shot[1]); });
    ui.rvShots.appendChild(b);
  });
  function seekTo(t) {
    doorGone();
    if (!video.paused) { state.ownPause = true; video.pause(); }
    if (t >= END - 0.02) { showEnd(); return; }
    state.phase = 'playing';
    ui.finalImg.hidden = true;
    ui.posterImg.classList.add('gone');
    video.currentTime = t;
    lastQuad = '';
    updateUI();
    kick();
  }
  ui.rvScrub.addEventListener('input', function () { state.scrubbing = true; seekTo(parseFloat(ui.rvScrub.value)); });
  ui.rvScrub.addEventListener('change', function () { state.scrubbing = false; });
  ui.rvPlay.addEventListener('click', function () {
    if (state.phase === 'ended') playFromStart();
    else if (video.paused) { video.play(); kick(); }
    else { state.ownPause = true; video.pause(); kick(); }
  });
  ui.rvRestart.addEventListener('click', playFromStart);
  ui.rvSpeed.addEventListener('click', function () {
    var rates = [1, 0.5, 0.25], r = rates[(rates.indexOf(video.playbackRate) + 1) % rates.length];
    video.playbackRate = r;
    ui.rvSpeed.textContent = 'Speed ' + (r === 1 ? '1' : r === 0.5 ? '½' : '¼') + '×';
  });
  ui.rvClose.addEventListener('click', function () { setReview(false); ui.reviewBtn.focus(); });
  ui.reviewBtn.addEventListener('click', function () { setReview(!state.review); });

  // ---------- Card photo layout editor (?layout=edit, only on this Mac) ----------
  // Shows the card flat and enlarged. Drag a photo to move it, its corner dot to resize, its top dot
  // to tilt (arrow keys, + / - and [ / ] work too). "Save layout" downloads a new card-photos.js.
  function flatTransform() {
    var W = ui.stage.clientWidth || window.innerWidth, H = ui.stage.clientHeight || window.innerHeight;
    var bar = document.querySelector('.layout-editor'), top = (bar ? bar.offsetTop + bar.offsetHeight : 0) + 56;   // room for the tilt dots
    var s = Math.max(0.25, Math.min((W - 48) / cardBox.w, (H - top - 28) / cardBox.h));
    var tx = W / 2 - s * (cardBox.x + cardBox.w / 2), ty = top + (H - top - 8) / 2 - s * (cardBox.y + cardBox.h / 2);
    return 'translate(' + tx.toFixed(1) + 'px, ' + ty.toFixed(1) + 'px) scale(' + s.toFixed(4) + ')';
  }
  var drag = null, selected = -1, LAYOUT_KEY = 'cardPhotosLayout';
  function persistLayout() {
    try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(PHOTOS)); } catch (e) { /* private window: fine */ }
  }
  function selectPhoto(i) {
    selected = i;
    photoEls.forEach(function (e, j) { e.fig.classList.toggle('selected', j === i); });
  }
  function photoCentre(p) {
    var r = ui.card.getBoundingClientRect();
    return { x: r.left + p.cx * r.width, y: r.top + p.cy * r.height, r: r };
  }
  function startDrag(e, i, mode) {
    if (!state.flat) return;
    e.preventDefault();
    e.stopPropagation();
    var p = PHOTOS[i];
    drag = { i: i, mode: mode, id: e.pointerId, x0: e.clientX, y0: e.clientY, cx: p.cx, cy: p.cy, w: p.w, rect: ui.card.getBoundingClientRect() };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) { /* no live pointer (scripted event) */ }
    selectPhoto(i);
    photoEls[i].fig.focus({ preventScroll: true });
  }
  function moveDrag(e) {
    if (!drag || e.pointerId !== drag.id) return;
    var p = PHOTOS[drag.i], r = drag.rect;
    if (drag.mode === 'move') {
      p.cx = clamp(drag.cx + (e.clientX - drag.x0) / r.width, 0, 1);
      p.cy = clamp(drag.cy + (e.clientY - drag.y0) / r.height, 0, 1);
    } else {
      var c = photoCentre(p);
      if (drag.mode === 'resize') {        // distance from the centre sets the size, at any tilt
        var d0 = Math.max(8, Math.hypot(drag.x0 - c.x, drag.y0 - c.y)), d1 = Math.hypot(e.clientX - c.x, e.clientY - c.y);
        p.w = clamp(drag.w * d1 / d0, 0.08, 0.7);
      } else {                             // the tilt handle points away from the centre
        p.r = Math.round(((Math.atan2(e.clientY - c.y, e.clientX - c.x) * 180 / Math.PI + 90 + 540) % 360) - 180);
      }
    }
    placePhotos();
    kick();
  }
  function endDrag(e) {
    if (drag && e.pointerId === drag.id) { drag = null; persistLayout(); }
  }
  function nudge(e) {
    var i = photoEls.findIndex(function (x) { return x.fig === e.currentTarget; }), p = PHOTOS[i], step = e.shiftKey ? 0.02 : 0.005;
    var keys = {
      ArrowLeft: function () { p.cx = clamp(p.cx - step, 0, 1); }, ArrowRight: function () { p.cx = clamp(p.cx + step, 0, 1); },
      ArrowUp: function () { p.cy = clamp(p.cy - step, 0, 1); }, ArrowDown: function () { p.cy = clamp(p.cy + step, 0, 1); },
      '+': function () { p.w = clamp(p.w + 0.01, 0.08, 0.7); }, '=': function () { p.w = clamp(p.w + 0.01, 0.08, 0.7); },
      '-': function () { p.w = clamp(p.w - 0.01, 0.08, 0.7); },
      '[': function () { p.r -= 1; }, ']': function () { p.r += 1; }
    };
    if (!keys[e.key] || !state.flat) return;
    e.preventDefault();
    keys[e.key]();
    selectPhoto(i);
    placePhotos();
    persistLayout();
    kick();
  }
  function wirePhotos() {
    photoEls.forEach(function (e, i) {
      e.fig.tabIndex = 0;
      e.fig.setAttribute('aria-label', e.p.en + '. Arrow keys move, plus and minus resize, square brackets tilt.');
      ['resize', 'rotate'].forEach(function (mode) {
        var h = el('span', 'ph-handle ph-' + mode);
        h.addEventListener('pointerdown', function (ev) { startDrag(ev, i, mode); });
        h.addEventListener('pointermove', moveDrag);
        h.addEventListener('pointerup', endDrag);
        h.addEventListener('pointercancel', endDrag);
        e.fig.appendChild(h);
      });
      e.fig.addEventListener('pointerdown', function (ev) { startDrag(ev, i, 'move'); });
      e.fig.addEventListener('pointermove', moveDrag);
      e.fig.addEventListener('pointerup', endDrag);
      e.fig.addEventListener('pointercancel', endDrag);
      e.fig.addEventListener('keydown', nudge);
    });
  }
  function saveLayout() {
    var out = PHOTOS.map(function (p) {
      return { id: p.id, src: p.src, en: p.en, zh: p.zh, cx: +p.cx.toFixed(3), cy: +p.cy.toFixed(3), w: +p.w.toFixed(3), r: Math.round(p.r), show: p.show };
    });
    var text = '/* Photos pasted on the invitation card.\n' +
      '   To rearrange them, open the invitation on this Mac with ?layout=edit at the end of the address,\n' +
      '   drag the photos, and press Save layout: it downloads a new card-photos.js to replace this file.\n' +
      '   Positions are fractions of the card: cx and cy = the photo\'s centre, w = its width, r = its tilt in degrees. */\n' +
      'window.CARD_PHOTOS = [\n' + out.map(function (p) { return '  ' + JSON.stringify(p); }).join(',\n') + '\n];\n';
    var a = el('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/javascript' }));
    a.download = 'card-photos.js';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    persistLayout();
    toast('Saved: card-photos.js is in your Downloads folder.');
  }
  function startEditor() {
    state.flat = true;
    document.documentElement.classList.add('layout-editing', 'flat');
    try {
      var saved = JSON.parse(localStorage.getItem(LAYOUT_KEY) || 'null');
      if (Array.isArray(saved) && saved.length === PHOTOS.length) PHOTOS = copyPhotos(saved);
    } catch (e) { /* nothing saved yet */ }
    buildPhotos();
    wirePhotos();
    var bar = el('div', 'layout-editor');
    bar.setAttribute('role', 'region');
    bar.setAttribute('aria-label', 'Card photo layout');
    bar.innerHTML = '<div class="le-row"><strong>Card photos</strong><span class="le-shows"></span><span class="le-buttons">' +
      '<button type="button" data-act="view">See it on the paper</button><button type="button" data-act="reset">Reset</button>' +
      '<button type="button" class="primary" data-act="save">Save layout</button></span></div>' +
      '<div class="le-tip">Drag a photo to move it · its corner dot resizes · its top dot tilts · arrow keys nudge · untick to hide</div>' +
      (window.innerWidth < 640 || window.innerHeight < 560
        ? '<div class="le-tip le-small">This window is small. For easier editing, open this page in a full-size browser window.</div>' : '');
    var shows = bar.querySelector('.le-shows'), SHORT = { 'asahiyama-zoo': 'Zoo', 'sapporo': 'Sapporo', 'lake-toya': 'Lake Toya', 'tenguyama-proposal': 'Tenguyama' };
    PHOTOS.forEach(function (p, i) {
      var label = el('label'), box = el('input');
      box.type = 'checkbox';
      box.checked = p.show;
      box.addEventListener('change', function () { PHOTOS[i].show = box.checked; placePhotos(); persistLayout(); kick(); });
      label.appendChild(box);
      label.appendChild(document.createTextNode(SHORT[p.id] || p.en.split(',')[0]));
      shows.appendChild(label);
    });
    bar.addEventListener('click', function (ev) {
      var act = ev.target.getAttribute && ev.target.getAttribute('data-act');
      if (act === 'save') saveLayout();
      if (act === 'reset') {
        PHOTOS = copyPhotos(window.CARD_PHOTOS);
        buildPhotos();
        wirePhotos();
        Array.prototype.forEach.call(shows.querySelectorAll('input'), function (b, i) { b.checked = PHOTOS[i].show; });
        persistLayout();
      }
      if (act === 'view') {
        state.flat = !state.flat;
        document.documentElement.classList.toggle('flat', state.flat);
        ev.target.textContent = state.flat ? 'See it on the paper' : 'Back to editing';
        if (!state.flat) selectPhoto(-1);
        placePhotos();                      // on the paper, photos clear the words as they will for guests
      }
      lastQuad = '';
      kick();
    });
    document.body.appendChild(bar);
    lastQuad = '';
    kick();
  }

  // ---------- Buttons ----------
  var toastTimer = 0;
  function toast(msg) {
    ui.toast.textContent = msg;
    ui.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { ui.toast.classList.remove('show'); }, 3600);
  }
  Array.prototype.forEach.call(document.querySelectorAll('[data-lang]'), function (b) {
    b.addEventListener('click', function () { begin(b.getAttribute('data-lang')); });
  });
  ui.langBtn.addEventListener('click', function () { applyLang(state.lang === 'en' ? 'zh' : 'en'); });
  ui.soundBtn.addEventListener('click', function () { setSound(!state.soundOn); });
  ui.skipBtn.addEventListener('click', function () { skipToEnd(); ui.cNames.focus(); });
  ui.replyChip.addEventListener('click', function () { skipToEnd(); openReply(); });
  ui.replayBtn.addEventListener('click', replay);
  ui.resumeBtn.addEventListener('click', function () {
    show(ui.resumeBtn, false);
    var p = video.play();
    if (p && p.catch) p.catch(function () { show(ui.resumeBtn, true); });
    kick();
  });
  ui.replyBtn.addEventListener('click', openReply);

  var resizeTimer = 0;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () { layoutDoor(); if (state.started) layoutCard(); lastQuad = ''; kick(); }, 120);
  });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { if (state.started) layoutCard(); });

  // ---------- Boot ----------
  if (params.get('motion') === 'reduced' ||
      (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)) {
    ui.reduceMotion.checked = true;
  }
  // A private edit link (…/#edit=<secret>): take the secret out of the address bar straight away.
  var editToken = '', linkMatch = /^#edit=([A-Za-z0-9_-]{43})$/.exec(location.hash);
  if (linkMatch && api.base) {
    editToken = linkMatch[1];
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { location.hash = ''; }
  }
  ui.posterImg.src = FILM.poster;
  ui.finalImg.src = FILM.final;
  var pos = (FILM.focusX * 100) + '% 50%';
  [video, ui.posterImg, ui.finalImg].forEach(function (m) { m.style.objectPosition = pos; });
  video.preload = ui.reduceMotion.checked || editToken ? 'metadata' : 'auto';
  video.poster = FILM.poster;
  video.muted = true;
  video.src = FILM.src;
  renderSound();                     // sound is on by default; the music starts with the language tap
  applyLang('en');
  apiStatus();                       // is a reply server here? (sets the note under the Reply button)

  if (editToken) {
    openFromLink(editToken);
  } else if (EDIT) {
    begin(params.get('lang') === 'zh' ? 'zh' : 'en', END);
    startEditor();
  } else {
    var lang = params.get('lang') === 'zh' ? 'zh' : params.get('lang') === 'en' ? 'en' : '';
    var at = params.get('t');
    if (at !== null || lang) {
      begin(lang || 'en', at === null ? undefined : (at === 'end' ? END : clamp(parseFloat(at) || 0, 0, END)));
      if (reviewEnabled && at !== null) setReview(true);
    } else {
      loadDoor();                    // the language screen, with the doors behind it
    }
  }
})();
