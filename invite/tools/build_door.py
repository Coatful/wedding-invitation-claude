"""Builds the door entrance from a door-opening GIF with see-through glass (e.g. Door-Opening-Transparent.gif).

    python3 -E -P tools/build_door.py ~/Downloads/Door-Opening-Transparent.gif media/door

It uses only the first frame (doors closed) and the last frame (doors open):
  door-scene.webp     the picture with the doorway cut out; its side windows stay see-through
  door-left.webp      the left door, hinged at its left edge (the page swings it open)
  door-right.webp     the right door
  door-backdrop.jpg   a tiny blurred copy for the sides of wide screens
  door.js             where the doorway is, in the picture's own pixels (read by invite.js)

The doorway is found by comparing the two frames: the open frame's see-through opening, plus everything
that changes as the doors open, filled across each row. The pictures are published at twice the source size
(KEEP_SCALE) with softened edges and a faint reflection on the glass. If you have a larger, sharper picture
as a GIF or a pair of PNG frames, run it through this again; invite.js reads the new door.js.

Needs Pillow with WebP support.
"""
import json
import os
import sys

from PIL import Image, ImageChops, ImageDraw, ImageFilter, features

KEEP_SCALE = 2          # published size, as a multiple of the source
GLASS_TOP, GLASS_BOTTOM = 30, 12   # the reflection's opacity (of 255) at the top and bottom of the picture


def frames(path):
    """The closed (first) and open (last) frames as RGBA."""
    im = Image.open(path)
    im.seek(0)
    first = im.convert('RGBA')
    im.seek(getattr(im, 'n_frames', 1) - 1)
    return first, im.convert('RGBA')


def doorway(closed, opened):
    """A mask of the doorway (255 inside) and its box, in source pixels."""
    w, h = closed.size
    clear = opened.getchannel('A').point(lambda v: 0 if v > 0 else 255)
    comp = clear.copy()
    ImageDraw.floodfill(comp, (w // 2, int(h * 0.55)), 128)      # the opening around the middle of the picture
    comp = comp.point(lambda v: 255 if v == 128 else 0)
    if not comp.getbbox():
        sys.exit('No see-through doorway in the middle of the last frame.')
    r, g, b = ImageChops.difference(closed.convert('RGB'), opened.convert('RGB')).split()
    changed = ImageChops.lighter(ImageChops.lighter(r, g), b).point(lambda v: 255 if v > 25 else 0)
    alpha = ImageChops.difference(closed.getchannel('A'), opened.getchannel('A')).point(lambda v: 255 if v else 0)
    seed = ImageChops.lighter(comp, ImageChops.lighter(changed, alpha))
    x0, y0, x1, y1 = comp.getbbox()
    mask = Image.new('L', (w, h), 0)
    draw = ImageDraw.Draw(mask)
    for y in range(max(0, y0 - 15), min(h, y1 + 9)):
        row = seed.crop((max(0, x0 - 40), y, min(w, x1 + 40), y + 1)).getbbox()
        if row:
            draw.line([(row[0] + max(0, x0 - 40), y), (row[2] - 1 + max(0, x0 - 40), y)], fill=255)
    return mask, mask.getbbox()


def main(src, out):
    if not features.check('webp'):
        sys.exit('This Pillow has no WebP support.')
    os.makedirs(out, exist_ok=True)
    closed, opened = frames(src)
    if closed.size != opened.size:
        sys.exit('The first and last frames differ in size.')
    w, h = closed.size
    K = KEEP_SCALE
    mask, (x0, y0, x1, y1) = doorway(closed, opened)
    mid = (x0 + x1) // 2

    def up(im):            # premultiplied, so see-through pixels don't bleed colour into the edges
        return im.convert('RGBa').resize((w * K, h * K), Image.LANCZOS).convert('RGBA')

    def up_mask(m, soften):
        return m.resize((w * K, h * K), Image.LANCZOS).filter(ImageFilter.GaussianBlur(soften))

    def glass(where):      # a faint reflection, brighter towards the top, so panes read as glass
        grad = Image.linear_gradient('L').resize((w * K, h * K))
        a = grad.point(lambda v: round(GLASS_TOP - (GLASS_TOP - GLASS_BOTTOM) * v / 255))
        layer = Image.new('RGBA', (w * K, h * K), (244, 246, 255, 0))
        layer.putalpha(ImageChops.multiply(a, up_mask(where, 0.5)))
        return layer

    picture, door = up(closed), up_mask(mask, 0.7)
    see_through = closed.getchannel('A').point(lambda v: 0 if v > 0 else 255)

    scene = glass(ImageChops.subtract(see_through, mask))
    scene.alpha_composite(picture)
    scene.putalpha(ImageChops.multiply(scene.getchannel('A'), ImageChops.invert(door)))
    scene.save(os.path.join(out, 'door-scene.webp'), quality=88, alpha_quality=100, method=6)

    doors = glass(ImageChops.multiply(see_through, mask))
    doors.alpha_composite(picture)
    doors.putalpha(ImageChops.multiply(doors.getchannel('A'), door))
    for name, box in (('left', (x0, y0, mid, y1)), ('right', (mid, y0, x1, y1))):
        doors.crop(tuple(v * K for v in box)).save(os.path.join(out, f'door-{name}.webp'), quality=90, alpha_quality=100, method=6)

    flat = Image.new('RGBA', (w, h), (226, 220, 242, 255))
    flat.alpha_composite(closed)
    flat.convert('RGB').resize((24, 43), Image.BOX).filter(ImageFilter.GaussianBlur(1.2)).save(
        os.path.join(out, 'door-backdrop.jpg'), quality=82)

    geo = {'w': w, 'h': h, 'x0': x0, 'y0': y0, 'x1': x1, 'y1': y1, 'mid': mid}
    with open(os.path.join(out, 'door.js'), 'w') as f:
        f.write('/* Made by tools/build_door.py: the door picture and its doorway, in the source picture\'s pixels. */\n')
        f.write('window.DOOR = ' + json.dumps(geo) + ';\n')
    print('doorway', geo)


if __name__ == '__main__':
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
