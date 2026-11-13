"""Offline regressions for output safety and Visio session ownership."""
import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import MagicMock, patch

spec = importlib.util.spec_from_file_location('to_visio', Path(__file__).resolve().parents[1] / 'lib/to_visio.py')
visio = importlib.util.module_from_spec(spec)
spec.loader.exec_module(visio)


class VisioTests(unittest.TestCase):
    def test_batch_rejects_existing_later_output(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            sources = [root / 'a.json', root / 'b.json']
            for source in sources:
                source.write_text('{}', encoding='utf8')
            existing = root / 'b.vsdx'
            existing.write_bytes(b'user edits')
            with self.assertRaises(FileExistsError):
                visio.plan_outputs(sources)
            self.assertFalse((root / 'a.vsdx').exists())
            self.assertEqual(existing.read_bytes(), b'user edits')
            self.assertEqual(len(visio.plan_outputs(sources, overwrite=True)), 2)

    def test_no_png_does_not_touch_existing_preview(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / 'a.json'
            source.write_text('{}', encoding='utf8')
            preview = root / 'a_visio.png'
            preview.write_bytes(b'keep')
            plan = visio.plan_outputs([source], png=False)
            self.assertIsNone(plan[0][3])
            self.assertEqual(preview.read_bytes(), b'keep')
            with self.assertRaises(FileExistsError):
                visio.plan_outputs([source])

    def test_duplicate_basename_rejected_even_with_overwrite(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            sources = [root / 'a' / 'fig.json', root / 'b' / 'fig.json']
            for source in sources:
                source.parent.mkdir()
                source.write_text('{}', encoding='utf8')
            with self.assertRaisesRegex(ValueError, 'collision'):
                visio.plan_outputs(sources, out=root / 'out', overwrite=True)

    def test_private_version_mismatch_quits_owned_app(self):
        app = MagicMock(Version='15.0')
        with patch.object(visio, 'w32', MagicMock()), patch.object(visio, 'dynamic', MagicMock()) as dynamic:
            dynamic.Dispatch.return_value = app
            with self.assertRaises(RuntimeError):
                visio.get_app(require_version='16')
        app.Quit.assert_called_once()

    def test_shared_session_is_never_owned(self):
        app = MagicMock(Version='16.0')
        with patch.object(visio, 'get_shared_app', return_value=(app, True)):
            self.assertEqual(visio.get_app(attach=True), (app, False))
        app.Quit.assert_not_called()

    def test_italic_subscript_formatting_keeps_com_property_dispatch(self):
        shape = MagicMock()
        runs = [[{'t': 'x', 'it': True, 'pos': 0}, {'t': 'i', 'it': True, 'pos': 1}]]
        with patch.object(visio, 'pythoncom', MagicMock(DISPATCH_PROPERTYPUT=4)):
            visio.set_text(shape, runs, 1, 2.3, True, asian_font_id=2)
        calls = shape.Characters._oleobj_.Invoke.call_args_list
        self.assertTrue(any(c.args[-2:] == (2, 3) for c in calls))
        self.assertTrue(any(c.args[-2:] == (4, 2) for c in calls))

    def test_pre_vsdx_private_server_is_rejected_and_closed(self):
        app = MagicMock(Version='12.0')
        with patch.object(visio, 'w32', MagicMock()), patch.object(visio, 'dynamic', MagicMock()) as dynamic:
            dynamic.Dispatch.return_value = app
            with self.assertRaisesRegex(RuntimeError, '2013'):
                visio.get_app()
        app.Quit.assert_called_once()

    def test_failed_drawing_closes_its_document(self):
        app = MagicMock()
        doc = app.Documents.Add.return_value
        with tempfile.TemporaryDirectory() as directory:
            plan = [('fig', {'w': 20, 'h': 10, 'font': 'Times New Roman'}, str(Path(directory) / 'fig.vsdx'), None)]
            with patch.object(visio, 'draw', side_effect=RuntimeError('drawing failed')):
                with self.assertRaises(RuntimeError):
                    visio.export_plans(app, plan)
        doc.Close.assert_called_once()
        doc.SaveAs.assert_not_called()
        app.Quit.assert_not_called()

    def test_main_cleans_owned_session_and_preserves_shared_settings(self):
        for owned in (True, False):
            with self.subTest(owned=owned):
                app = MagicMock(AlertResponse=3)
                with patch('sys.argv', ['to_visio.py', 'fig.json']), \
                     patch.object(visio, 'plan_outputs', return_value=[]), \
                     patch.object(visio, 'load_com'), \
                     patch.object(visio, 'get_app', return_value=(app, owned)), \
                     patch.object(visio, 'export_plans', side_effect=RuntimeError('export failed')):
                    with self.assertRaises(RuntimeError):
                        visio.main()
                self.assertEqual(app.AlertResponse, 3)
                self.assertEqual(app.Quit.call_count, int(owned))
                self.assertEqual(app.Settings.SetRasterExportResolution.call_count, int(owned))

    def test_asian_font_and_white_memory_label_reach_visio(self):
        page = MagicMock()
        fig = {'h': 20, 'prims': [{'type': 'rect', 'x': 1, 'y': 1, 'w': 15, 'h': 8,
                'fill': '#595959', 'stroke': '#000000', 'sw': .35, 'rx': 0,
                'label': [[{'t': 'RAM', 'it': False, 'pos': 0}]], 'bold': True,
                'textFill': '#ffffff'}]}
        visio.draw(page, fig, 1, 23, 2)
        shape = page.DrawRectangle.return_value
        calls = shape.CellsU.call_args_list
        self.assertIn(unittest.mock.call('Char.AsianFont'), calls)
        # Assert actual cell formulas with independent cell mocks.
        shape.CellsU.side_effect = lambda name: cells.setdefault(name, MagicMock())
        cells = {}
        visio.draw(page, fig, 1, 23, 2)
        self.assertEqual(cells['Char.AsianFont'].FormulaU, '2')
        self.assertEqual(cells['Char.Color'].FormulaU, 'RGB(255,255,255)')


if __name__ == '__main__':
    unittest.main()
