#!/usr/bin/env python3
"""Build Hush's brand SVGs, macOS assets, and native-size contact sheet.

Needs: Python with Pillow + fontTools, `rsvg-convert` (brew install librsvg), and the
Inter Display font at assets/brand/fonts/extras/ttf/InterDisplay-Regular.ttf
(https://github.com/rsms/inter, SIL OFL; not committed). Writes into assets/brand/.
"""
from pathlib import Path
import json
import math
import os
import random
import shutil
import subprocess
import sys
try:
    from fontTools.ttLib import TTFont
    from fontTools.pens.svgPathPen import SVGPathPen
    from fontTools.pens.transformPen import TransformPen
except ImportError:
    sys.exit('pip install pillow fonttools')
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent  # assets/brand
APP = ROOT / 'app-icon'
SET = APP / 'AppIcon.appiconset'
MENU = ROOT / 'menubar'
WORD = ROOT / 'wordmark'
ROUND = ROOT / 'rounds' / 'round2'
RSVG = shutil.which('rsvg-convert') or 'rsvg-convert'
FONT = ROOT / 'fonts/extras/ttf/InterDisplay-Regular.ttf'
BODY = 'M300 100H724C858 100 924 166 924 300V724C924 858 858 924 724 924H300C166 924 100 858 100 724V300C100 166 166 100 300 100Z'
# Stroked decaying sine: 2.5 cycles of noise easing into a perfectly flat line (55% of length).
def _wave(x0=318, x1=706, cy=512, amp=112, noisy=.52, cycles=2.25, n=260):
    pts = []
    for i in range(n + 1):
        t = i / n
        x = x0 + (x1 - x0) * t
        u = min(t / noisy, 1)
        env = amp * (1 - u) ** 1.6
        pts.append(f'{x:.2f} {cy - env * math.sin(2 * math.pi * cycles * u):.2f}')
    return 'M' + 'L'.join(pts)
WAVE = _wave()

STATES = ('off', 'low', 'high', 'disconnected')


def svg(width, height, content, title):
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}"><title>{title}</title>{content}</svg>'


def write(path, text):
    path.write_text(text + '\n')


def render(source, target, width, height=None):
    command = [RSVG, '-w', str(width), '-o', str(target)]
    if height is not None:
        command += ['-h', str(height)]
    subprocess.run(command + [str(source)], check=True)


def master():
    rng = random.Random(700)
    grain = ''.join(f'<rect x="{x}" y="{y}" width="1" height="1" fill="{rng.choice(["#fff", "#000"])}" opacity=".023"/>' for y in range(64) for x in range(64) if rng.random() < .5)
    wedges = []
    for n in range(180):
        a = math.radians(n * 2)
        b = math.radians(n * 2 + 2.12)  # Slight overlap prevents hairline seams.
        theta = (a + b) / 2
        intensity = (1 + math.cos(2 * (theta + 3 * math.pi / 4))) / 2
        value = round(138 + 94 * intensity)
        blue = round(142 + 92 * intensity)
        color = f'#{value:02x}{value:02x}{blue:02x}'
        x1, y1 = 512 + 284 * math.cos(a), 512 + 284 * math.sin(a)
        x2, y2 = 512 + 284 * math.cos(b), 512 + 284 * math.sin(b)
        wedges.append(f'<path d="M512 512L{x1:.3f} {y1:.3f}A284 284 0 0 1 {x2:.3f} {y2:.3f}Z" fill="{color}"/>')
    rings = ''.join(f'<circle cx="512" cy="512" r="{r}" fill="none" stroke="{"#fff" if r % 4 == 0 else "#000"}" stroke-opacity=".027" stroke-width=".85"/>' for r in range(4, 279, 2))
    defs = f'''<defs>
<path id="body" d="{BODY}"/><clipPath id="bodyClip"><use href="#body"/></clipPath>
<clipPath id="face"><circle cx="512" cy="512" r="278"/></clipPath>
<pattern id="grain" width="64" height="64" patternUnits="userSpaceOnUse">{grain}</pattern>
<linearGradient id="bodyMetal" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#2a2a2c"/><stop offset=".42" stop-color="#1b1b1d"/><stop offset="1" stop-color="#0c0c0d"/></linearGradient>
<linearGradient id="bodyEdge" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#fff" stop-opacity=".16"/><stop offset=".35" stop-color="#fff" stop-opacity=".035"/><stop offset="1" stop-color="#000" stop-opacity=".3"/></linearGradient>
<linearGradient id="chamfer" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#e8e8ea"/><stop offset=".45" stop-color="#bebec1"/><stop offset="1" stop-color="#555559"/></linearGradient>
<linearGradient id="rim" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#f3f3f4"/><stop offset=".42" stop-color="#d7d7d9"/><stop offset=".65" stop-color="#8a8a8e"/><stop offset="1" stop-color="#3a3a3d"/></linearGradient>
<linearGradient id="socketEdge" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#000"/><stop offset=".45" stop-color="#09090a"/><stop offset="1" stop-color="#414144"/></linearGradient>
<filter id="shadow" x="-.12" y="-.12" width="1.24" height="1.24" color-interpolation-filters="sRGB"><feDropShadow dx="0" dy="10" stdDeviation="10" flood-color="#000" flood-opacity=".3"/></filter>
<filter id="socketShadow" x="-.12" y="-.12" width="1.24" height="1.24" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="2.5"/></filter>
<filter id="soften" x="-.02" y="-.02" width="1.04" height="1.04" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation=".7"/></filter>
</defs>'''
    # Keep gradient faces outside shadow filters: librsvg can quantize dark source fills.
    content = f'''{defs}<use href="#body" fill="#000" filter="url(#shadow)"/>
<use href="#body" fill="url(#bodyMetal)"/>
<g clip-path="url(#bodyClip)"><use href="#body" fill="url(#grain)"/>
<use href="#body" fill="none" stroke="url(#bodyEdge)" stroke-width="3"/>
<circle cx="512" cy="513" r="287" fill="#000" opacity=".65" filter="url(#socketShadow)"/>
<circle cx="512" cy="512" r="284" fill="#080809" stroke="url(#socketEdge)" stroke-width="2"/>
<circle cx="512" cy="512" r="280" fill="url(#chamfer)"/>
<g clip-path="url(#face)"><circle cx="512" cy="512" r="278" fill="#bcbcbf"/>
<g filter="url(#soften)">{''.join(wedges)}</g>
<g filter="url(#soften)">{rings}</g><circle cx="512" cy="512" r="278" fill="url(#grain)" opacity=".45"/>
<path d="{WAVE}" transform="translate(0 2)" fill="none" stroke="#e8e8ea" stroke-opacity=".55" stroke-width="30" stroke-linecap="round"/>
<path d="{WAVE}" fill="none" stroke="#141416" stroke-width="30" stroke-linecap="round" stroke-linejoin="round"/>
</g><circle cx="512" cy="512" r="279.5" fill="none" stroke="url(#rim)" stroke-width="1"/>
</g>'''
    write(APP / 'AppIcon.svg', svg(1024, 1024, content, 'Hush — silenced machined disc'))


def hinted():
    designs = {
        16: '<rect x="1" y="1" width="14" height="14" rx="3.2" fill="#151517"/><circle cx="8" cy="8" r="5.5" fill="#dcdcdf"/><path d="M4.5 8.5L5.5 6.5L6.5 9.5L7.5 8.5H11.5" fill="none" stroke="#141416" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"/>',
        32: '<rect x="3" y="3" width="26" height="26" rx="5.9" fill="#151517"/><circle cx="16" cy="16" r="10.5" fill="#dcdcdf"/><circle cx="16" cy="16" r="10.5" fill="none" stroke="#000" stroke-opacity=".5" stroke-width=".75"/><path d="M9.5 16L11 12.5L13 19.5L14.5 14.5L16 16H22.5" fill="none" stroke="#141416" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
    }
    for size, design in designs.items():
        write(APP / f'icon-{size}.svg', svg(size, size, design, f'Hush — hand-hinted {size} px icon'))


def _lobes(x0, half, peaks, cy, n=12):
    """Smooth half-sine lobes (one per peak, signed pt amplitude) starting at x0 on baseline cy."""
    pts = []
    for k, p in enumerate(peaks):
        for i in range(n + (k == len(peaks) - 1)):
            u = i / n
            pts.append((x0 + (k + u) * half, cy - p * math.sin(math.pi * u)))
    return pts


def _glyph(state, cy):
    # Bare wave, 2..16 pt; the wave itself shows the ANC level.
    line = lambda pts: 'M' + 'L'.join(f'{x:.3f} {y:.3f}' for x, y in pts)
    if state == 'off':
        return [line(_lobes(2, 3.5, [4.5, -5.5, 5, -3.5], cy))]
    if state == 'low':
        return [line(_lobes(2, 2.5, [4, -3, 1.5], cy) + [(16, cy)])]
    if state == 'high':
        return [line([(2, cy)] + _lobes(4, 2, [1.6, -1.6], cy) + [(16, cy)])]
    # disconnected: flat line broken by a gap, slashed through
    return [f'M2 {cy}H6.5', f'M11.5 {cy}H16', f'M7.25 {cy + 4.5}L10.75 {cy - 4.5}']


def menu_sources():
    for state in STATES:
        # 2x master (18 pt): 1.5 pt stroke, baseline 8.75 pt -> covers px rows 16-18 at 36 px.
        # 1x hinted: 2 px stroke, baseline 9 -> covers px rows 8-9 at 18 px.
        for name, cy, weight in [(f'MenuBar-{state}.svg', 8.75, 1.5), (f'MenuBar-{state}-1x.svg', 9, 2)]:
            paths = ''.join(f'<path d="{d}"/>' for d in _glyph(state, cy))
            content = f'<g fill="none" stroke="#000" stroke-width="{weight}" stroke-linecap="round" stroke-linejoin="round">{paths}</g>'
            write(MENU / name, svg(18, 18, content, f'Hush — {state} template glyph'))


def wordmarks():
    font = TTFont(FONT)
    glyph_set = font.getGlyphSet()
    cmap = font.getBestCmap()
    cap_height = 112
    scale = cap_height / font['OS/2'].sCapHeight
    tracking = font['head'].unitsPerEm * scale * .03
    diameter = cap_height * 1.15
    height = 192
    cx, cy = 20 + diameter / 2, height / 2
    start = 20 + diameter + cap_height * .45
    first_bearing = font['hmtx'][cmap[ord('H')]][1] * scale
    cursor = start - first_bearing
    outlines = []
    for index, char in enumerate('Hush'):
        name = cmap[ord(char)]
        pen = SVGPathPen(glyph_set)
        transformed = TransformPen(pen, (scale, 0, 0, -scale, cursor, cy + cap_height / 2))
        glyph_set[name].draw(transformed)
        outlines.append(f'<path d="{pen.getCommands()}"/>')
        cursor += font['hmtx'][name][0] * scale + (tracking if index < 3 else 0)
    width = math.ceil(cursor + 20)
    for mode, color in [('dark', '#e6e6e8'), ('light', '#1c1c1e')]:
        # Wave is knocked out of the disc (true transparency), so it reads on any background.
        mask = f'<mask id="cut" maskUnits="userSpaceOnUse" x="0" y="0" width="{width}" height="{height}"><rect width="{width}" height="{height}" fill="#fff"/><path d="{WAVE}" transform="translate({cx} {cy}) scale({diameter / 556}) translate(-512 -512)" fill="none" stroke="#000" stroke-width="38" stroke-linecap="round" stroke-linejoin="round"/></mask>'
        content = f'<defs>{mask}</defs><circle cx="{cx}" cy="{cy}" r="{diameter / 2}" fill="{color}" mask="url(#cut)"/><g fill="{color}">{"".join(outlines)}</g>'
        write(WORD / f'wordmark-{mode}.svg', svg(width, height, content, f'Hush — {mode} outlined Inter Display Regular lockup'))
        render(WORD / f'wordmark-{mode}.svg', WORD / f'wordmark-{mode}.png', width * 2, height * 2)
    font.close()


def icon_assets():
    render(APP / 'AppIcon.svg', APP / 'AppIcon.png', 1024, 1024)
    master_image = Image.open(APP / 'AppIcon.png').convert('RGBA')
    entries = []
    for points in (16, 32, 128, 256, 512):
        for scale in (1, 2):
            pixels = points * scale
            suffix = '@2x' if scale == 2 else ''
            filename = f'icon_{points}x{points}{suffix}.png'
            if pixels <= 64:
                source = APP / ('icon-16.svg' if pixels == 16 else 'icon-32.svg')
                render(source, SET / filename, pixels, pixels)
            else:
                master_image.resize((pixels, pixels), Image.Resampling.LANCZOS).save(SET / filename)
            entries.append({'filename': filename, 'idiom': 'mac', 'size': f'{points}x{points}', 'scale': f'{scale}x'})
    write(SET / 'Contents.json', json.dumps({'images': entries, 'info': {'author': 'xcode', 'version': 1}}, indent=2))


def font(size):
    return ImageFont.truetype(str(ROOT / 'fonts/extras/ttf/InterDisplay-Regular.ttf'), size)


def load(path):
    with Image.open(path) as im:
        return im.convert('RGBA')


def white_template(image):
    result = Image.new('RGBA', image.size, '#fff')
    result.putalpha(image.getchannel('A'))
    return result


def sheet():
    half, height = 1280, 2040
    image = Image.new('RGB', (half * 2, height), '#1e1e1e')
    draw = ImageDraw.Draw(image)
    draw.rectangle((half, 0, half * 2 - 1, height), fill='#f5f5f7')
    for index, (mode, foreground, quiet) in enumerate([('dark', '#e8e8ea', '#99999d'), ('light', '#151517', '#707075')]):
        origin = index * half
        def label(x, y, text, size=14, bright=False):
            draw.text((origin + x, y), text, font=font(size), fill=foreground if bright else quiet)
        def paste(asset, x, y, zoom=1, white=False):
            rendered = load(asset)
            if white:
                rendered = white_template(rendered)
            if zoom != 1:
                rendered = rendered.resize((rendered.width * zoom, rendered.height * zoom), Image.Resampling.NEAREST)
            image.paste(rendered, (origin + x, y), rendered)
        label(40, 32, 'HUSH  /  ROUND 2', 26, True)
        label(40, 74, f'{mode.upper()}  ·  flat machined aluminium / engraved silence', 16)
        label(40, 124, 'APP ICON  ·  native pixels', 13)
        paste(SET / 'icon_512x512.png', 40, 156)
        label(262, 678, '512 px')
        paste(SET / 'icon_128x128.png', 652, 338)
        label(687, 484, '128 px')
        paste(SET / 'icon_16x16.png', 897, 394)
        label(869, 438, '16 px · hinted')
        paste(SET / 'icon_32x32.png', 1090, 386)
        label(1067, 438, '32 px · hinted')
        label(40, 720, 'MENU BAR  ·  off / low / high / disconnected', 13)
        for scale, y, bar_height in [(1, 754, 48), (2, 824, 64)]:
            # White at 58% over the light panel, matching a translucent menu-bar strip.
            bar = '#fbfbfc' if mode == 'light' else '#2b2b2d'
            draw.rectangle((origin + 40, y, origin + 1239, y + bar_height - 1), fill=bar)
            label(60, y + (bar_height - 16) // 2, f'{scale}x')
            for col, state in enumerate(STATES):
                size = 18 * scale
                x = 190 + col * 267
                suffix = '@2x' if scale == 2 else ''
                paste(MENU / f'MenuBar-{state}{suffix}.png', x, y + (bar_height - size) // 2, white=mode == 'dark')
                label(x + size + 14, y + (bar_height - 16) // 2, state)
        label(40, 954, 'WORDMARK  ·  Inter Display Regular / outlined / native 2x PNG', 13)
        paste(WORD / f'wordmark-{mode}.png', 40, 994)
        label(40, 1472, 'PIXEL INSPECTION  ·  8x nearest-neighbour / no smoothing', 13)
        paste(SET / 'icon_16x16.png', 40, 1514, zoom=8)
        label(40, 1658, '16 px × 8')
        paste(SET / 'icon_32x32.png', 230, 1514, zoom=8)
        label(230, 1786, '32 px × 8')
        for col, state in enumerate(STATES):
            x = 566 + col * 166
            paste(MENU / f'MenuBar-{state}.png', x, 1514, zoom=8, white=mode == 'dark')
            label(x, 1674, f'{state} · 18 px × 8', 12)
            paste(MENU / f'MenuBar-{state}@2x.png', x, 1714, zoom=4, white=mode == 'dark')
            label(x, 1874, f'{state} · 36 px × 4', 12)
        label(40, 2000, '1024 master → 128–1024 Lanczos  ·  16 / 32 / 64 use hand-hinted vectors  ·  glyphs: black + alpha', 12)
    image.save(ROOT / 'contact-sheet.png')
    shutil.copyfile(ROOT / 'contact-sheet.png', ROUND / 'round2-sheet.png')


def verify():
    contents = json.loads((SET / 'Contents.json').read_text())
    assert len(contents['images']) == 10
    for entry in contents['images']:
        points = int(entry['size'].split('x')[0])
        scale = int(entry['scale'][0])
        im = load(SET / entry['filename'])
        assert im.size == (points * scale, points * scale)
        assert im.getpixel((0, 0))[3] == 0 and im.getpixel((im.width // 2, im.height // 2))[3] == 255
        assert entry['idiom'] == 'mac'
    for state in STATES:
        for scale in (1, 2):
            suffix = '@2x' if scale == 2 else ''
            im = load(MENU / f'MenuBar-{state}{suffix}.png')
            assert im.size == (18 * scale, 18 * scale)
            assert im.getpixel((0, 0))[3] == 0
            assert all(r == g == b == 0 for r, g, b, a in im.get_flattened_data()), 'Template RGB must be black, including transparent pixels'
        if state == 'high':
            assert all(load(MENU / 'MenuBar-high.png').getpixel((x, 9))[3] == 255 for x in range(9, 15)), 'Flat line must hit a solid pixel row'
    for mode in ('dark', 'light'):
        source = (WORD / f'wordmark-{mode}.svg').read_text()
        assert '<text' not in source and '<path' in source
        im = load(WORD / f'wordmark-{mode}.png')
        assert im.height == 384 and im.getpixel((0, 0))[3] == 0
    assert (ROOT / 'contact-sheet.png').read_bytes() == (ROUND / 'round2-sheet.png').read_bytes()
    print('Built and checked: 9 SVGs, 23 PNGs, macOS Contents.json. Contact sheet: 2560 × 1864.')


def main():
    for directory in (APP, SET, MENU, WORD, ROUND):
        directory.mkdir(parents=True, exist_ok=True)
    master()
    hinted()
    menu_sources()
    wordmarks()
    icon_assets()
    for state in STATES:
        for scale in (1, 2):
            suffix = '@2x' if scale == 2 else ''
            render(MENU / (f'MenuBar-{state}.svg' if scale == 2 else f'MenuBar-{state}-1x.svg'), MENU / f'MenuBar-{state}{suffix}.png', 18 * scale, 18 * scale)
    sheet()
    verify()


if __name__ == '__main__':
    main()
