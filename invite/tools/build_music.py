#!/usr/bin/env python3
"""Join music tracks into one looping soundtrack for the invitation.

usage:  python3 -E -P tools/build_music.py OUT.m4a FIRST.mp3 [NEXT.mp3 ...]

The page plays OUT on a loop from the moment a guest chooses a language, so it keeps going after
the film ends. Joining the tracks into one file (instead of switching tracks in the page) means
there is no gap while the next track loads and nothing for iPhones to block between tracks.

For each track the script keeps TAIL seconds of the silence after the music ends (with a short fade,
so no click). All tracks get the SAME gain, which keeps the soundtrack album's own balance between the
pieces. The gain is only what's needed to keep peaks below PEAK_LIMIT. (Matching each track's overall
loudness instead made "A Walk in the Skies", whose soft opening is followed by a loud climax, start about
12 dB below "Heartbeat", as if the music had stopped.) Then it encodes AAC at BITRATE. Needs ffmpeg (Homebrew).

The music is not stored in the public GitHub repository (see ../.gitignore); keep the originals.
"""
import os
import re
import shutil
import subprocess
import sys

FFMPEG = shutil.which("ffmpeg") or "/opt/homebrew/bin/ffmpeg"
FFPROBE = shutil.which("ffprobe") or "/opt/homebrew/bin/ffprobe"
PEAK_LIMIT = -1.5        # dBTP; all tracks are lowered together just enough to stay below this
TAIL = 0.8              # seconds of quiet kept after each piece ends (plus the next piece's own lead-in)
FADE = 0.3               # fade at the cut, so it never clicks
BITRATE = "128k"
SILENCE_DB = -50         # quieter than this counts as silence


def ffmpeg_err(args):
    return subprocess.run([FFMPEG, "-hide_banner", "-nostats", *args, "-f", "null", "-"],
                          capture_output=True, text=True).stderr


def duration(path):
    out = subprocess.run([FFPROBE, "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path],
                         capture_output=True, text=True, check=True).stdout
    return float(out.strip())


def music_end(path, total):
    """Where the trailing silence starts (or the end, if there is none)."""
    log = ffmpeg_err(["-i", path, "-map", "0:a:0", "-af", f"silencedetect=noise={SILENCE_DB}dB:d=0.25"])
    starts = [float(x) for x in re.findall(r"silence_start: ([0-9.]+)", log)]
    ends = [float(x) for x in re.findall(r"silence_end: ([0-9.]+)", log)]
    if starts and (len(ends) < len(starts) or ends[-1] >= total - 0.05):
        return starts[-1]
    return total


def loudness(path):
    log = ffmpeg_err(["-i", path, "-map", "0:a:0", "-af", "ebur128=peak=true"])
    i = float(re.findall(r"I:\s+(-?[0-9.]+) LUFS", log)[-1])
    peak = float(re.findall(r"Peak:\s+(-?[0-9.]+) dBFS", log)[-1])
    return i, peak


def main():
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    out, tracks = os.path.abspath(sys.argv[1]), [os.path.abspath(p) for p in sys.argv[2:]]
    os.makedirs(os.path.dirname(out), exist_ok=True)
    parts, labels, info = [], [], []
    for path in tracks:
        total = duration(path)
        end = min(total, music_end(path, total) + TAIL)
        info.append((path, total, end, *loudness(path)))
    gain = min(0.0, PEAK_LIMIT - max(i[4] for i in info))      # one gain for every track
    for n, (path, total, end, lufs, peak) in enumerate(info):
        print(f"{os.path.basename(path)}: {total:.1f}s, music ends {end - TAIL:.1f}s, "
              f"{lufs:.1f} LUFS (peak {peak:.1f} dBFS) -> {lufs + gain:.1f} LUFS, keep 0-{end:.2f}s")
        parts.append(f"[{n}:a:0]atrim=0:{end:.3f},asetpts=N/SR/TB,afade=t=out:st={end - FADE:.3f}:d={FADE},"
                     f"volume={gain:.2f}dB,aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo[a{n}]")
        labels.append(f"[a{n}]")
    graph = ";".join(parts) + ";" + "".join(labels) + f"concat=n={len(tracks)}:v=0:a=1[out]"
    args = [FFMPEG, "-v", "error", "-y"]
    for path in tracks:
        args += ["-i", path]
    codec = "aac_at" if "aac_at" in subprocess.run([FFMPEG, "-hide_banner", "-encoders"], capture_output=True,
                                                     text=True).stdout else "aac"
    args += ["-filter_complex", graph, "-map", "[out]", "-map_metadata", "-1", "-c:a", codec, "-b:a", BITRATE,
             "-movflags", "+faststart", out]
    subprocess.run(args, check=True)
    lufs, peak = loudness(out)
    print(f"wrote {out}: {duration(out):.1f}s, {os.path.getsize(out) / 1048576:.2f} MB, "
          f"{lufs:.1f} LUFS, peak {peak:.1f} dBFS ({codec} {BITRATE})")


if __name__ == "__main__":
    main()
