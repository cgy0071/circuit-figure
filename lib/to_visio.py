# Replay figure primitives (the <name>.json files written by build.mjs) into Visio.
# Needs Windows, an installed Visio and pywin32.
#
# Usage:
#   python to_visio.py <fig.json> [more.json ...] [--out DIR] [--visio PATH]
#                      [--require-version PREFIX] [--dash-pattern N] [--dpi N] [--no-png]
#
#   --out DIR                output directory (default: next to each JSON)
#   --visio PATH             VISIO.EXE to start when no Visio is running (default: $VISIO_EXE,
#                            then the newest standard Office install, then the registered COM server)
#   --require-version PREFIX fail unless the attached Visio version starts with PREFIX (e.g. 16)
#   --dash-pattern N         Visio LinePattern used for dashed wires (default 23, short dash)
#   --dpi N                  resolution of the PNG exported from the Visio page (default 600)
#   --no-png                 write the .vsdx only
#
# Writes <name>.vsdx and <name>_visio.png per JSON.
import argparse
import glob
import json
import os
import subprocess
import sys
import time

import pythoncom
import win32com.client as w32
from win32com.client import dynamic

MM = 1 / 25.4  # Visio internal units are inches


def rgb(h):
    h = h.lstrip('#')
    return 'RGB(%d,%d,%d)' % (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))


def cell(shp, name, formula):
    shp.CellsU(name).FormulaU = formula


def put_char_prop(chars, idx, val):
    dispid = chars._oleobj_.GetIDsOfNames('CharProps')
    chars._oleobj_.Invoke(dispid, 0, pythoncom.DISPATCH_PROPERTYPUT, 0, idx, val)


def set_text(shp, lines, font_id, size_mm, bold, color='#1a1a1a'):
    """lines: list of run lists [{t, it, pos}]"""
    text = '\n'.join(''.join(r['t'] for r in ln) for ln in lines)
    shp.Text = text
    for m in ('LeftMargin', 'RightMargin', 'TopMargin', 'BottomMargin'):
        cell(shp, m, '0 mm')
    cell(shp, 'Char.Size', '%.2f pt' % (size_mm * 72 / 25.4))
    cell(shp, 'Char.Font', str(font_id))
    cell(shp, 'Char.AsianFont', str(font_id))
    cell(shp, 'Char.ComplexScriptFont', str(font_id))
    cell(shp, 'Char.Color', rgb(color))
    if bold:
        cell(shp, 'Char.Style', '1')
    pos = 0
    for ln in lines:
        for r in ln:
            n = len(r['t'])
            if r['it'] or r['pos']:
                ch = shp.Characters
                ch.Begin = pos
                ch.End = pos + n
                if r['it']:
                    put_char_prop(ch, 2, (1 if bold else 0) | 2)   # visCharacterStyle: italic
                if r['pos']:
                    put_char_prop(ch, 4, 2 if r['pos'] == 1 else 1)  # visCharacterPos: 2 sub, 1 super
            pos += n
        pos += 1  # newline


def draw(page, fig, font_id, dash_pattern):
    H = fig['h']
    X = lambda x: x * MM
    Y = lambda y: (H - y) * MM
    for p in fig['prims']:
        t = p['type']
        if t == 'rect':
            s = page.DrawRectangle(X(p['x']), Y(p['y'] + p['h']), X(p['x'] + p['w']), Y(p['y']))
            cell(s, 'FillForegnd', rgb(p['fill']))
            cell(s, 'LineColor', rgb(p['stroke']))
            cell(s, 'LineWeight', '%.3f mm' % p['sw'])
            cell(s, 'Rounding', '%.3f mm' % p['rx'])
            if p.get('label'):
                set_text(s, p['label'], font_id, fig.get('fs', 2.3), p.get('bold'))
        elif t == 'circle':
            r = p['r']
            s = page.DrawOval(X(p['x'] - r), Y(p['y'] + r), X(p['x'] + r), Y(p['y'] - r))
            cell(s, 'FillForegnd', rgb(p['fill']))
            if p.get('stroke'):
                cell(s, 'LineColor', rgb(p['stroke']))
                cell(s, 'LineWeight', '%.3f mm' % p['sw'])
            else:
                cell(s, 'LinePattern', '0')
            if p.get('label'):
                set_text(s, p['label'], font_id, p.get('lsize', 2.4), False)
        elif t in ('poly', 'line'):
            pts = [q[:] for q in p['pts']]
            if t == 'poly' and p['closed']:
                pts.append(pts[0][:])
            flat = []
            for q in pts:
                flat += [X(q[0]), Y(q[1])]
            s = page.DrawPolyline(tuple(flat), 0)
            cell(s, 'Rounding', '0 mm')
            if t == 'poly':
                cell(s, 'LineColor', rgb(p['stroke']))
                cell(s, 'LineWeight', '%.3f mm' % p['sw'])
                if p['closed'] and p.get('fill'):
                    cell(s, 'FillForegnd', rgb(p['fill']))
                else:
                    cell(s, 'FillPattern', '0')
            else:
                cell(s, 'FillPattern', '0')
                cell(s, 'LineColor', rgb(p['color']))
                cell(s, 'LineWeight', '%.3f mm' % p['w'])
                if p.get('dash'):
                    cell(s, 'LinePattern', str(dash_pattern))
                length = sum(abs(pts[k][0] - pts[k - 1][0]) + abs(pts[k][1] - pts[k - 1][1]) for k in range(1, len(pts)))
                size = '1' if (p['w'] > 0.5 and length > 7) else '0'
                if p['arrow'] in ('end', 'both'):
                    cell(s, 'EndArrow', '4'); cell(s, 'EndArrowSize', size)
                if p['arrow'] in ('start', 'both'):
                    cell(s, 'BeginArrow', '4'); cell(s, 'BeginArrowSize', size)
        elif t == 'text':
            n = sum(len(r['t']) for r in p['runs'])
            w = n * p['size'] * 0.62 + 2
            h = p['size'] * 1.7
            cy = p['y'] - p['size'] * 0.34
            x0 = {'start': p['x'], 'middle': p['x'] - w / 2, 'end': p['x'] - w}[p['anchor']]
            s = page.DrawRectangle(X(x0), Y(cy + h / 2), X(x0 + w), Y(cy - h / 2))
            cell(s, 'LinePattern', '0')
            cell(s, 'FillPattern', '0')
            set_text(s, [p['runs']], font_id, p['size'], p['bold'], p['fill'])
            cell(s, 'Para.HorzAlign', {'start': '0', 'middle': '1', 'end': '2'}[p['anchor']])


def find_visio_exe():
    """Newest VISIO.EXE under the standard Office install roots, or None."""
    found = []
    for root in (os.environ.get('PROGRAMFILES'), os.environ.get('PROGRAMFILES(X86)')):
        if not root:
            continue
        found += glob.glob(os.path.join(root, 'Microsoft Office', 'root', 'Office*', 'VISIO.EXE'))
        found += glob.glob(os.path.join(root, 'Microsoft Office', 'Office*', 'VISIO.EXE'))

    def ver(p):
        d = os.path.basename(os.path.dirname(p))
        digits = ''.join(c for c in d if c.isdigit())
        return int(digits) if digits else 0
    return max(found, key=ver) if found else None


def get_app(exe=None, require_version=None):
    """Attach to a running Visio, else start one. Returns (app, started_here).

    The registered COM server can point at an old Visio when several versions are installed,
    so an explicit or discovered VISIO.EXE is started directly and attached to; the registered
    server is the last resort."""
    started = False
    obj = None
    try:
        obj = w32.GetActiveObject('Visio.Application')
    except Exception:
        exe = exe or os.environ.get('VISIO_EXE') or find_visio_exe()
        if exe:
            subprocess.Popen([exe, '/nologo'])
            started = True
            for _ in range(60):
                time.sleep(1.5)
                try:
                    obj = w32.GetActiveObject('Visio.Application')
                    break
                except Exception:
                    pass
            if obj is None:
                raise RuntimeError('Visio did not start: %s' % exe)
        else:
            obj = w32.Dispatch('Visio.Application')
            started = True
    app = dynamic.Dispatch(obj._oleobj_)
    if require_version and not str(app.Version).startswith(require_version):
        raise RuntimeError('attached to Visio %s, expected %s; close the other Visio first' % (app.Version, require_version))
    return app, started


def main():
    ap = argparse.ArgumentParser(description='Replay figure JSON into Visio (.vsdx + PNG).')
    ap.add_argument('json', nargs='+', help='JSON primitive lists written by build.mjs')
    ap.add_argument('--out', help='output directory (default: next to each JSON)')
    ap.add_argument('--visio', help='path of VISIO.EXE to start')
    ap.add_argument('--require-version', help='required Visio version prefix, e.g. 16')
    ap.add_argument('--dash-pattern', type=int, default=23)
    ap.add_argument('--dpi', type=float, default=600.0)
    ap.add_argument('--no-png', action='store_true')
    a = ap.parse_args()

    app, started = get_app(a.visio, a.require_version)
    app.AlertResponse = 7
    try:
        try:
            app.Settings.SetRasterExportResolution(3, a.dpi, a.dpi, 0)
        except Exception as e:
            print('export resolution left at default:', repr(e)[:80])
        for src in a.json:
            src = os.path.abspath(src)
            name = os.path.splitext(os.path.basename(src))[0]
            out = os.path.abspath(a.out) if a.out else os.path.dirname(src)
            os.makedirs(out, exist_ok=True)
            with open(src, encoding='utf8') as fh:
                fig = json.load(fh)
            doc = app.Documents.Add('')
            page = app.ActivePage
            ps = page.PageSheet
            ps.CellsU('PageWidth').FormulaU = '%g mm' % fig['w']
            ps.CellsU('PageHeight').FormulaU = '%g mm' % fig['h']
            page.Name = name[:31]
            font_id = doc.Fonts.Item(fig['font']).ID
            draw(page, fig, font_id, a.dash_pattern)
            vsdx = os.path.join(out, name + '.vsdx')
            png = os.path.join(out, name + '_visio.png')
            for f in (vsdx, png):
                if os.path.exists(f):
                    os.remove(f)
            doc.SaveAs(vsdx)
            if not a.no_png:
                page.Export(png)
            print('%s: %d shapes, Visio %s -> %s' % (name, page.Shapes.Count, app.Version, vsdx))
            doc.Close()
    finally:
        app.AlertResponse = 0
        if started or app.Documents.Count == 0:
            app.Quit()


if __name__ == '__main__':
    sys.exit(main())
