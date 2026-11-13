# Replay figure primitives (the <name>.json files written by build.mjs) into Visio.
# Needs Windows, an installed Visio and pywin32.
#
# Usage:
#   python to_visio.py <fig.json> [more.json ...] [--out DIR] [--visio PATH]
#                      [--require-version PREFIX] [--dash-pattern N] [--dpi N] [--no-png]
#
#   --out DIR                output directory (default: next to each JSON)
#   --attach                 opt into a shared session (never quit it)
#   --overwrite              allow replacing requested outputs
#   --font-asian NAME        override Chinese/East Asian font
#   --visio PATH             with --attach, VISIO.EXE to start when none is running ($VISIO_EXE,
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

# Load COM only when exporting; --help and offline tests work on any platform.
w32 = None
dynamic = None
pythoncom = None


def load_com():
    global w32, dynamic, pythoncom
    try:
        import pythoncom
        import win32com.client as w32
        from win32com.client import dynamic
    except ImportError as exc:
        raise RuntimeError('Visio export requires Windows, Visio and pywin32') from exc

MM = 1 / 25.4  # Visio internal units are inches


def rgb(h):
    h = h.lstrip('#')
    return 'RGB(%d,%d,%d)' % (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))


def cell(shp, name, formula):
    shp.CellsU(name).FormulaU = formula


def put_char_prop(chars, idx, val):
    dispid = chars._oleobj_.GetIDsOfNames('CharProps')
    chars._oleobj_.Invoke(dispid, 0, pythoncom.DISPATCH_PROPERTYPUT, 0, idx, val)


def set_text(shp, lines, font_id, size_mm, bold, color='#1a1a1a', asian_font_id=None):
    """lines: list of run lists [{t, it, pos}]"""
    text = '\n'.join(''.join(r['t'] for r in ln) for ln in lines)
    shp.Text = text
    for m in ('LeftMargin', 'RightMargin', 'TopMargin', 'BottomMargin'):
        cell(shp, m, '0 mm')
    cell(shp, 'Char.Size', '%.2f pt' % (size_mm * 72 / 25.4))
    cell(shp, 'Char.Font', str(font_id))
    cell(shp, 'Char.AsianFont', str(font_id if asian_font_id is None else asian_font_id))
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


def draw(page, fig, font_id, dash_pattern, asian_font_id=None):
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
                set_text(s, p['label'], font_id, fig.get('fs', 2.3), p.get('bold'), p.get('textFill', '#1a1a1a'), asian_font_id)
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
                set_text(s, p['label'], font_id, p.get('lsize', 2.4), p.get('bold', False), asian_font_id=asian_font_id)
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
            set_text(s, [p['runs']], font_id, p['size'], p['bold'], p['fill'], asian_font_id)
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


def get_shared_app(exe=None, require_version=None):
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


def get_app(exe=None, require_version=None, attach=False):
    if attach:
        # Shared sessions are never quit by the exporter, even if launched here.
        app, _ = get_shared_app(exe, require_version)
        if float(app.Version) < 15:
            raise RuntimeError('VSDX export requires Visio 2013 or newer; registered session is %s' % app.Version)
        return app, False
    if exe:
        raise ValueError('--visio requires --attach; private export uses registered Visio')
    obj = w32.DispatchEx('Visio.InvisibleApp')
    app = dynamic.Dispatch(obj._oleobj_)
    try:
        if float(app.Version) < 15:
            raise RuntimeError('VSDX export requires Visio 2013 or newer; registered COM server is %s' % app.Version)
        if require_version and not str(app.Version).startswith(require_version):
            raise RuntimeError('Visio %s does not match required version %s' % (app.Version, require_version))
    except BaseException:
        app.Quit()
        raise
    return app, True


def plan_outputs(sources, out=None, png=True, overwrite=False):
    """Check the entire batch before COM starts or any output is changed."""
    plans = []
    seen = set()
    inputs = {os.path.normcase(os.path.realpath(src)) for src in sources}
    for src in sources:
        src = os.path.abspath(src)
        with open(src, encoding='utf8') as fh:
            fig = json.load(fh)
        name = os.path.splitext(os.path.basename(src))[0]
        directory = os.path.abspath(out) if out else os.path.dirname(src)
        vsdx = os.path.join(directory, name + '.vsdx')
        preview = os.path.join(directory, name + '_visio.png') if png else None
        for target in filter(None, (vsdx, preview)):
            key = os.path.normcase(os.path.realpath(target))
            if key in seen or key in inputs:
                raise ValueError('output path collision: %s' % target)
            seen.add(key)
            if os.path.isdir(target) or (os.path.lexists(target) and not overwrite):
                raise FileExistsError('output exists: %s (choose a new directory or pass --overwrite)' % target)
        plans.append((name, fig, vsdx, preview))
    return plans


def export_plans(app, plans, dash_pattern=23, font_asian=None):
    for name, fig, vsdx, png in plans:
        os.makedirs(os.path.dirname(vsdx), exist_ok=True)
        doc = app.Documents.Add('')
        try:
            page = doc.Pages.Item(1)
            page.PageSheet.CellsU('PageWidth').FormulaU = '%g mm' % fig['w']
            page.PageSheet.CellsU('PageHeight').FormulaU = '%g mm' % fig['h']
            page.Name = name[:31]
            font_id = doc.Fonts.Item(fig['font']).ID
            asian_id = doc.Fonts.Item(font_asian or fig.get('fontAsian', fig['font'])).ID
            draw(page, fig, font_id, dash_pattern, asian_id)
            doc.SaveAs(vsdx)
            if png:
                page.Export(png)
            print('%s: %d shapes, Visio %s -> %s' % (name, page.Shapes.Count, app.Version, vsdx))
        finally:
            # Only this newly created document is discarded on failure.
            doc.Saved = True
            doc.Close()


def main():
    ap = argparse.ArgumentParser(description='Replay figure JSON into Visio (.vsdx + PNG).')
    ap.add_argument('json', nargs='+', help='JSON primitive lists written by build.mjs')
    ap.add_argument('--out', help='output directory (default: next to each JSON)')
    ap.add_argument('--visio', help='with --attach, path of VISIO.EXE to start')
    ap.add_argument('--require-version', help='required Visio version prefix, e.g. 16')
    ap.add_argument('--dash-pattern', type=int, default=23)
    ap.add_argument('--dpi', type=float, default=600.0)
    ap.add_argument('--no-png', action='store_true')
    ap.add_argument('--overwrite', action='store_true', help='allow replacing existing requested outputs')
    ap.add_argument('--attach', action='store_true', help='use a shared visible session; never quit it')
    ap.add_argument('--font-asian', help='override the Chinese/East Asian font, e.g. SimSun')
    a = ap.parse_args()
    if a.visio and not a.attach:
        ap.error('--visio requires --attach; private export uses registered Visio')
    if a.dpi <= 0:
        ap.error('--dpi must be positive')
    plans = plan_outputs(a.json, a.out, not a.no_png, a.overwrite)
    load_com()
    app, owned = get_app(a.visio, a.require_version, a.attach)
    try:
        previous_alert = app.AlertResponse
        try:
            app.AlertResponse = 7
            if owned and not a.no_png:
                app.Settings.SetRasterExportResolution(3, a.dpi, a.dpi, 0)
            elif not owned and not a.no_png:
                print('shared session: using its existing raster resolution; --dpi applies to private sessions')
            export_plans(app, plans, a.dash_pattern, a.font_asian)
        finally:
            app.AlertResponse = previous_alert
    finally:
        if owned:
            app.Quit()


if __name__ == '__main__':
    sys.exit(main())
