#!/usr/bin/env python3
"""Prepare the invitation video for the web.

usage:  python3 -E -P tools/build_media.py source/VIDEO.mp4 media

Needs ffmpeg (Homebrew) and Pillow. Writes into the output folder:
  invite.mp4     the film, re-encoded for phones and browsers (H.264, sound kept)
  poster.jpg     its first frame, shown while the film loads and behind the language screen
  final.jpg      its last frame, shown when the film ends and for reduced motion
  manifest.js    size, frame rate, duration and the blank sheet's corners in the final frames

The paper settings below are tuned to the current video (1280×720, 24 fps, 241 frames).
If the video is replaced, check PAPER_LAST against the new last frame.
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile

from PIL import Image

FFMPEG = shutil.which("ffmpeg") or "/opt/homebrew/bin/ffmpeg"
FFPROBE = shutil.which("ffprobe") or "/opt/homebrew/bin/ffprobe"
VIDEO_CRF = 23           # lower = better quality, bigger file (23 ≈ 4 MB for this clip)
JPEG_QUALITY = 84
FOCUS_X = 0.48           # where phones crop the landscape film (0 = left edge, 1 = right edge)

# The blank sheet the camera settles on: its corners on the LAST frame (top-left, top-right,
# bottom-right, bottom-left). The script tracks the edges backwards to PAPER_FIRST.
PAPER_LAST = [(399, 55), (827, 57), (892, 698), (330, 695)]
PAPER_FIRST = 185
PAPER_SIZE = (428, 640)  # layout size of the sheet in the page's CSS (its last-frame size)


# ---------- paper tracking ----------
def line_x_of_y(p, q):  # x = a*y + b through two points
    a = (q[0] - p[0]) / (q[1] - p[1])
    return a, p[0] - a * p[1]


def line_y_of_x(p, q):  # y = c*x + d through two points
    c = (q[1] - p[1]) / (q[0] - p[0])
    return c, p[1] - c * p[0]


def fit(pts, swap=False):
    """Least-squares line, refit twice without the worst quarter of the points."""
    def solve(ps):
        if swap:
            ps = [(p[1], p[0]) for p in ps]
        n = len(ps)
        sy = sum(p[1] for p in ps); sx = sum(p[0] for p in ps)
        syy = sum(p[1] * p[1] for p in ps); sxy = sum(p[0] * p[1] for p in ps)
        a = (n * sxy - sx * sy) / (n * syy - sy * sy)
        return a, (sx - a * sy) / n
    a, b = solve(pts)
    for _ in range(2):
        if swap:
            pts = sorted(pts, key=lambda p: abs(p[1] - (a * p[0] + b)))
        else:
            pts = sorted(pts, key=lambda p: abs(p[0] - (a * p[1] + b)))
        pts = pts[: max(4, int(len(pts) * 0.75))]
        a, b = solve(pts)
    return a, b


def track_paper(frame_paths, first, last):
    tl, tr, br, bl = PAPER_LAST
    L, R = line_x_of_y(tl, bl), line_x_of_y(tr, br)
    T, B = line_y_of_x(tl, tr), line_y_of_x(bl, br)
    out = {}
    for n in range(last, first - 1, -1):
        im = Image.open(frame_paths[n]).convert("L")
        px = im.load()
        W, H = im.size

        def gx(y, x):
            return px[min(W - 1, x + 3), y] - px[max(0, x - 3), y]

        def gy(x, y):
            return px[x, min(H - 1, y + 3)] - px[x, max(0, y - 3)]

        def xat(line, y):
            return line[0] * y + line[1]

        def yat(line, x):
            return line[0] * x + line[1]

        top = (yat(T, xat(L, T[1])) + yat(T, xat(R, T[1]))) / 2
        bot = (yat(B, xat(L, B[1])) + yat(B, xat(R, B[1]))) / 2
        lp, rp, tp, bp = [], [], [], []
        for k in range(14):
            y = int(top + (bot - top) * (0.12 + 0.8 * k / 13))       # left edge: brighter to the right
            x0 = int(xat(L, y))
            xs = range(max(3, x0 - 40), min(W - 4, x0 + 40))
            if 2 < y < H - 3 and xs:
                lp.append((max(xs, key=lambda x: gx(y, x)), y))
            y = int(top + (bot - top) * (0.35 + 0.6 * k / 13))       # right edge, below the bouquet
            x0 = int(xat(R, y))
            xs = range(max(3, x0 - 40), min(W - 4, x0 + 40))
            if 2 < y < H - 3 and xs:
                rp.append((min(xs, key=lambda x: gx(y, x)), y))
        lt, rt, lb, rb = xat(L, top), xat(R, top), xat(L, bot), xat(R, bot)
        for k in range(14):
            x = int(lt + (rt - lt) * (0.1 + 0.55 * k / 13))          # top edge, left of the bouquet
            y0 = int(yat(T, x))
            ys = range(max(3, y0 - 30), min(H - 4, y0 + 30))
            if 0 <= x < W and ys:
                tp.append((x, max(ys, key=lambda y: gy(x, y))))
            x = int(lb + (rb - lb) * (0.1 + 0.8 * k / 13))           # bottom edge
            y0 = int(yat(B, x))
            ys = range(max(3, y0 - 30), min(H - 4, y0 + 30))
            if 0 <= x < W and ys:
                bp.append((x, min(ys, key=lambda y: gy(x, y))))
        L, R = fit(lp), fit(rp)
        if len(tp) >= 4:
            T = fit(tp, swap=True)
        if len(bp) >= 4:
            B = fit(bp, swap=True)

        def meet(v, h):
            a, b = v
            c, d = h
            y = (c * b + d) / (1 - c * a)
            return (a * y + b, y)

        out[n] = [meet(L, T), meet(R, T), meet(R, B), meet(L, B)]
    return out


def polyfit3(xs, ys):
    """Cubic least squares (normal equations), x scaled to [-1, 1] for stability."""
    lo, hi = min(xs), max(xs)
    u = [(2 * (x - lo) / (hi - lo)) - 1 for x in xs]
    m = [[sum(t ** (i + j) for t in u) for j in range(4)] for i in range(4)]
    v = [sum(y * t ** i for t, y in zip(u, ys)) for i in range(4)]
    for c in range(4):  # Gaussian elimination
        p = max(range(c, 4), key=lambda r: abs(m[r][c]))
        m[c], m[p] = m[p], m[c]; v[c], v[p] = v[p], v[c]
        for r in range(c + 1, 4):
            f = m[r][c] / m[c][c]
            m[r] = [a - f * b for a, b in zip(m[r], m[c])]; v[r] -= f * v[c]
    coef = [0.0] * 4
    for r in range(3, -1, -1):
        coef[r] = (v[r] - sum(m[r][k] * coef[k] for k in range(r + 1, 4))) / m[r][r]
    return [sum(coef[i] * t ** i for i in range(4)) for t in u]


def smooth_quads(raw, first, last):
    frames = list(range(first, last + 1))
    series, worst = {}, 0.0
    for c in range(4):
        for a in range(2):
            ys = [raw[n][c][a] for n in frames]
            fitted = polyfit3(frames, ys)
            worst = max(worst, max(abs(p - q) for p, q in zip(ys, fitted)))
            series[(c, a)] = fitted
    quads = [[round(series[(c, a)][i], 1) for c in range(4) for a in range(2)] for i in range(len(frames))]
    return quads, worst


# ---------- main ----------
def probe(video, entries, stream="v:0"):
    out = subprocess.run([FFPROBE, "-v", "error", "-select_streams", stream, "-show_entries", entries,
                          "-of", "default=nw=1:nk=1", video], capture_output=True, text=True, check=True)
    return out.stdout.split()


def main():
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    video, out_dir = os.path.abspath(sys.argv[1]), os.path.abspath(sys.argv[2])
    os.makedirs(out_dir, exist_ok=True)

    num, den = (probe(video, "stream=r_frame_rate")[0].split("/") + ["1"])[:2]
    fps = float(num) / float(den)
    duration = float(probe(video, "format=duration", stream="v:0")[0])
    audio = probe(video, "stream=codec_name", stream="a:0")
    audio_args = ["-c:a", "copy"] if audio[:1] == ["aac"] else (["-c:a", "aac", "-b:a", "128k"] if audio else ["-an"])

    mp4 = os.path.join(out_dir, "invite.mp4")
    subprocess.run([FFMPEG, "-v", "error", "-y", "-i", video,
                    "-c:v", "libx264", "-preset", "slow", "-crf", str(VIDEO_CRF),
                    "-profile:v", "high", "-level", "4.0", "-pix_fmt", "yuv420p",
                    "-g", str(round(fps)), "-keyint_min", str(round(fps / 2)),
                    "-movflags", "+faststart"] + audio_args + [mp4], check=True)

    with tempfile.TemporaryDirectory(prefix="wedding-film-") as tmp:
        subprocess.run([FFMPEG, "-v", "error", "-y", "-i", video, "-start_number", "0",
                        os.path.join(tmp, "%04d.png")], check=True)
        paths = sorted(os.path.join(tmp, f) for f in os.listdir(tmp) if f.endswith(".png"))
        count = len(paths)
        W, H = Image.open(paths[0]).size
        for name, path in (("poster.jpg", paths[0]), ("final.jpg", paths[-1])):
            Image.open(path).convert("RGB").save(os.path.join(out_dir, name), "JPEG",
                                                 quality=JPEG_QUALITY, optimize=True, progressive=True)
        last = count - 1
        first = min(PAPER_FIRST, last)
        raw = track_paper(paths, first, last)
        quads, worst = smooth_quads(raw, first, last)

    rel = os.path.basename(out_dir.rstrip("/")) + "/"
    manifest = {
        "src": rel + "invite.mp4", "poster": rel + "poster.jpg", "final": rel + "final.jpg",
        "w": W, "h": H, "fps": round(fps, 3), "frames": count, "duration": round(duration, 4),
        "focusX": FOCUS_X,
        "paper": {"first": first, "size": list(PAPER_SIZE), "quads": quads},
    }
    with open(os.path.join(out_dir, "manifest.js"), "w") as f:
        f.write("/* Generated by tools/build_media.py. Do not edit by hand. */\n")
        f.write("window.FILM = " + json.dumps(manifest, separators=(",", ":")) + ";\n")
    sizes = {n: os.path.getsize(os.path.join(out_dir, n)) / 1048576 for n in ("invite.mp4", "poster.jpg", "final.jpg")}
    print(f"{count} frames at {fps:g} fps, {W}x{H}, {duration:.2f} s")
    print(", ".join(f"{n} {s:.2f} MB" for n, s in sizes.items()))
    print(f"paper tracked over frames {first}-{last}; largest smoothing correction {worst:.1f} px")


if __name__ == "__main__":
    main()
