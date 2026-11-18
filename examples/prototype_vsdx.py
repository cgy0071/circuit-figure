"""Proof of concept: package basic circuit-figure JSON as native Visio XML."""
import argparse
import json
import math
from pathlib import Path
import xml.etree.ElementTree as ET
from zipfile import ZIP_DEFLATED, ZipFile


VISIO = 'http://schemas.microsoft.com/office/visio/2012/main'
PACKAGE = 'http://schemas.openxmlformats.org/package/2006/'
OFFICE_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
VISIO_REL = 'http://schemas.microsoft.com/visio/2010/relationships/'
xml = ET.SubElement


def root(name):
    return ET.Element(name, {'xmlns': VISIO})


def cell(parent, name, value, formula=None):
    attributes = {'N': name, 'V': str(value)}
    if formula is not None:
        attributes['F'] = formula
    return xml(parent, 'Cell', attributes)


def cells(parent, **values):
    for name, value in values.items():
        cell(parent, name, value)


def inches(mm):
    return mm / 25.4


def transform(shape, x, y, width, height):
    cells(shape, Width=width, Height=height, Angle=0)
    cells(shape, PinX=x + width / 2, PinY=y + height / 2)
    cell(shape, 'LocPinX', width / 2, 'Width*0.5')
    cell(shape, 'LocPinY', height / 2, 'Height*0.5')


def geometry(shape, points, filled):
    section = xml(shape, 'Section', N='Geometry', IX='0')
    cells(section, NoFill=int(not filled), NoLine=0)
    for index, (x, y) in enumerate(points, 1):
        row = xml(section, 'Row', T='RelMoveTo' if index == 1 else 'RelLineTo', IX=str(index))
        cells(row, X=x, Y=y)


def label(shape, fig, primitive):
    cells(shape, LeftMargin=0, RightMargin=0, TopMargin=0, BottomMargin=0, VerticalAlign=1)
    paragraph = xml(xml(shape, 'Section', N='Paragraph'), 'Row', IX='0')
    cell(paragraph, 'HorzAlign', 1)
    character = xml(shape, 'Section', N='Character')
    message = xml(shape, 'Text')
    index = 0
    marker = None
    for line_number, line in enumerate(primitive['label']):
        if line_number:
            if marker is None:
                message.text = (message.text or '') + '\n'
            else:
                marker.tail += '\n'
        for run in line:
            row = xml(character, 'Row', IX=str(index))
            cells(row, Font=fig['font'], AsianFont=fig.get('fontAsian', fig['font']),
                  Size=inches(fig['fs']), Color=primitive.get('textFill', '#1a1a1a'),
                  Style=int(bool(primitive.get('bold'))) + 2 * int(run['it']),
                  Pos={0: 0, 1: 2, 2: 1}[run['pos']])
            marker = xml(message, 'cp', IX=str(index))
            marker.tail = run['t']
            index += 1


def rectangle(shape, fig, primitive):
    x, y, width, height = (primitive[k] for k in ('x', 'y', 'w', 'h'))
    transform(shape, inches(x), inches(fig['h'] - y - height), inches(width), inches(height))
    cells(shape, FillPattern=1, FillForegnd=primitive['fill'], LinePattern=1,
          LineColor=primitive['stroke'], LineWeight=inches(primitive['sw']), Rounding=inches(primitive['rx']))
    geometry(shape, [(0, 0), (1, 0), (1, 1), (0, 1), (0, 0)], True)
    if primitive.get('label'):
        label(shape, fig, primitive)


def line(shape, fig, primitive, ends):
    points = [(inches(x), inches(fig['h'] - y)) for x, y in primitive['pts']]
    cells(shape, FillPattern=0, LineColor=primitive['color'], LineWeight=inches(primitive['w']),
          LinePattern=23 if primitive.get('dash') else 1)
    for value, arrow in [('Begin', 'start'), ('End', 'end')]:
        cell(shape, value + 'Arrow', 4 if primitive['arrow'] in (arrow, 'both') else 0)
        cell(shape, value + 'ArrowSize', 0)
    if ends:
        (x0, y0), (x1, y1) = points
        width = math.hypot(x1 - x0, y1 - y0)
        cells(shape, Height=0, LocPinY=0)
        cell(shape, 'PinX', (x0 + x1) / 2, '(BeginX+EndX)/2')
        cell(shape, 'PinY', (y0 + y1) / 2, '(BeginY+EndY)/2')
        cell(shape, 'Width', width, 'SQRT((EndX-BeginX)^2+(EndY-BeginY)^2)')
        cell(shape, 'LocPinX', width / 2, 'Width*0.5')
        cell(shape, 'Angle', math.atan2(y1 - y0, x1 - x0), 'ATAN2(EndY-BeginY,EndX-BeginX)')
        for prefix, (x, y), (target, port) in zip(('Begin', 'End'), points, ends):
            formula = f'PAR(PNT(Sheet.{target}!Connections.X{port},Sheet.{target}!Connections.Y{port}))'
            cell(shape, prefix + 'X', x, formula)
            cell(shape, prefix + 'Y', y, formula)
        geometry(shape, [(0, 0), (1, 0)], False)
    else:
        xs, ys = zip(*points)
        x, y = min(xs), min(ys)
        width, height = max(xs) - x, max(ys) - y
        transform(shape, x, y, width, height)
        geometry(shape, [((px - x) / (width or 1), (py - y) / (height or 1)) for px, py in points], False)


def page_xml(fig, links):
    page = root('PageContents')
    page.set('xml:space', 'preserve')
    shapes = xml(page, 'Shapes')
    records = dict(enumerate(fig['prims'], 1))
    objects = {i: xml(shapes, 'Shape', ID=str(i), Type='Shape', LineStyle='0', FillStyle='0', TextStyle='0')
               for i in records}
    ports = {}
    ends = {}
    for wire, begin, end in links:
        primitive = records.get(wire)
        if wire in ends or not primitive or primitive['type'] != 'line':
            raise ValueError(f'glued wire {wire} must name a unique line')
        points = primitive['pts']
        if len(points) != 2 or points[0] == points[1]:
            raise ValueError(f'glued wire {wire} must have two distinct endpoints')
        ends[wire] = []
        for target, (x, y) in zip((begin, end), points):
            if target not in records or records[target]['type'] != 'rect':
                raise ValueError(f'glue target {target} must be a rectangle')
            rect = records[target]
            u = (x - rect['x']) / rect['w']
            v = 1 - (y - rect['y']) / rect['h']
            # Normalize roundoff at a rectangle edge before recording its port.
            u, v = (round(fraction, 12) for fraction in (u, v))
            if not (0 <= u <= 1 and 0 <= v <= 1 and (u in (0, 1) or v in (0, 1))):
                raise ValueError(f'wire {wire} endpoint must touch rectangle {target} at its boundary')
            positions = ports.setdefault(target, [])
            if (u, v) not in positions:
                positions.append((u, v))
            ends[wire].append((target, positions.index((u, v)) + 1))
    for i, primitive in records.items():
        shape = objects[i]
        if primitive['type'] == 'rect':
            rectangle(shape, fig, primitive)
        elif primitive['type'] == 'line':
            line(shape, fig, primitive, ends.get(i))
        else:
            raise ValueError(f"prototype does not support {primitive['type']!r} (shape {i})")
    for target, positions in ports.items():
        shape = objects[target]
        section = ET.Element('Section', N='Connection')
        text = shape.find('Text')
        shape.insert(list(shape).index(text) if text is not None else len(shape), section)
        rect = records[target]
        for index, (u, v) in enumerate(positions):
            row = xml(section, 'Row', T='Connection', IX=str(index))
            cell(row, 'X', inches(u * rect['w']), f'Width*{u}')
            cell(row, 'Y', inches(v * rect['h']), f'Height*{v}')
            cells(row, DirX=0, DirY=0, Type=0)
    if ends:
        connects = xml(page, 'Connects')
        for wire, targets in ends.items():
            for which, part, (target, port) in zip(('BeginX', 'EndX'), ('9', '12'), targets):
                xml(connects, 'Connect', FromSheet=str(wire), FromCell=which, FromPart=part,
                    ToSheet=str(target), ToCell=f'Connections.X{port}', ToPart=str(99 + port))
    return page


def relationships(kind, target):
    root = ET.Element('Relationships', xmlns=PACKAGE + 'relationships')
    xml(root, 'Relationship', Id='rId1', Type=VISIO_REL + kind, Target=target)
    return root


def package(fig, links):
    pages = root('Pages')
    pages.set('xmlns:r', OFFICE_REL)
    page = xml(pages, 'Page', ID='0', NameU='Drawing', Name='Drawing', ViewScale='-1',
               ViewCenterX=str(inches(fig['w']) / 2), ViewCenterY=str(inches(fig['h']) / 2))
    sheet = xml(page, 'PageSheet', LineStyle='0', FillStyle='0', TextStyle='0')
    cells(sheet, PageWidth=inches(fig['w']), PageHeight=inches(fig['h']), PageScale=1, DrawingScale=1)
    xml(page, 'Rel', {'r:id': 'rId1'})

    windows = root('Windows')
    xml(windows, 'Window', ID='0', WindowType='Drawing', ContainerType='Page', Page='0', ViewScale='-1',
        ViewCenterX=page.get('ViewCenterX'), ViewCenterY=page.get('ViewCenterY'))
    document_rels = relationships('pages', 'pages/pages.xml')
    xml(document_rels, 'Relationship', Id='rId2', Type=VISIO_REL + 'windows', Target='windows.xml')

    document = root('VisioDocument')
    faces = xml(document, 'FaceNames')
    for name in dict.fromkeys([fig['font'], fig.get('fontAsian', fig['font'])]):
        xml(faces, 'FaceName', NameU=name)
    styles = xml(document, 'StyleSheets')
    style = xml(styles, 'StyleSheet', ID='0', NameU='No Style', Name='No Style')
    cells(style, EnableLineProps=1, EnableFillProps=1, EnableTextProps=1)

    types = ET.Element('Types', xmlns=PACKAGE + 'content-types')
    xml(types, 'Default', Extension='rels', ContentType='application/vnd.openxmlformats-package.relationships+xml')
    xml(types, 'Default', Extension='xml', ContentType='application/xml')
    for path, kind in [('visio/document.xml', 'drawing.main'), ('visio/windows.xml', 'windows'),
                       ('visio/pages/pages.xml', 'pages'),
                       ('visio/pages/page1.xml', 'page')]:
        xml(types, 'Override', PartName='/' + path, ContentType=f'application/vnd.ms-visio.{kind}+xml')
    return {
        '[Content_Types].xml': types,
        '_rels/.rels': relationships('document', 'visio/document.xml'),
        'visio/document.xml': document,
        'visio/_rels/document.xml.rels': document_rels,
        'visio/windows.xml': windows,
        'visio/pages/pages.xml': pages,
        'visio/pages/_rels/pages.xml.rels': relationships('page', 'page1.xml'),
        'visio/pages/page1.xml': page_xml(fig, links),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    parser.add_argument('target', type=Path)
    parser.add_argument('--glue', type=int, action='append', nargs=3, default=[],
                        metavar=('WIRE', 'BEGIN_RECT', 'END_RECT'),
                        help='attach both endpoints by one-based primitive index')
    args = parser.parse_args()
    if args.target.suffix.lower() != '.vsdx':
        parser.error('target must end in .vsdx')
    try:
        parts = package(json.loads(args.source.read_text(encoding='utf8')), args.glue)
        with ZipFile(args.target, 'x', compression=ZIP_DEFLATED) as archive:
            for name, element in parts.items():
                archive.writestr(name, ET.tostring(element, encoding='utf-8', xml_declaration=True))
    except (KeyError, OSError, ValueError) as error:
        parser.error(str(error))


if __name__ == '__main__':
    main()
