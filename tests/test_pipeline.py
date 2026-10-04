"""Unit tests for the pure logic. Run: python -m unittest discover -s tests -v   (stdlib only)."""
import pathlib
import sys
import unittest

ROOT = pathlib.Path(__file__).parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "sources"))

import hours       # noqa: E402
import geo         # noqa: E402
import tiles       # noqa: E402
import xref        # noqa: E402


class HoursTests(unittest.TestCase):
    def test_two_windows(self):
        h = hours.parse_hours("9am - 6:30pm (Mon-Fri) 11am - 12 Noon (Sat)")
        self.assertEqual(h, [[[1, 2, 3, 4, 5], 540, 1110], [[6], 660, 720]])

    def test_daily_and_midday(self):
        self.assertEqual(hours.parse_hours("8am - 6:30pm (Mon-Sun)"), [[[1, 2, 3, 4, 5, 6, 7], 480, 1110]])
        self.assertEqual(hours.parse_hours("10am - 2 pm (Mon-Fri)"), [[[1, 2, 3, 4, 5], 600, 840]])

    def test_all_day(self):
        self.assertEqual(hours.parse_hours("24 hrs (Mon-Sun)"), [[[1, 2, 3, 4, 5, 6, 7], 0, 1440]])

    def test_unparseable_is_empty_not_wrong(self):
        self.assertEqual(hours.parse_hours("see signs"), [])
        self.assertEqual(hours.parse_hours(None), [])

    def test_describe(self):
        self.assertEqual(hours.describe([[[1, 2, 3, 4, 5], 600, 840]]), "Mon to Fri 10am to 2pm")
        self.assertEqual(hours.describe([[[1, 2, 3, 4, 5, 6, 7], 0, 1440]]), "Mon to Sun all day")

    def test_zone_names(self):
        self.assertEqual(hours.zone_name({"NAME": "Beckton", "PREFIX": "B", "Id": 34}), "Beckton extension")
        self.assertEqual(hours.zone_name({"NAME": "Canning Town", "PREFIX": "ICT", "Id": 36}), "Canning Town industrial")


class GeoTests(unittest.TestCase):
    SQUARE = [[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]]

    def test_point_in_polygon(self):
        self.assertTrue(geo.pip(0.5, 0.5, [self.SQUARE]))
        self.assertFalse(geo.pip(1.5, 0.5, [self.SQUARE]))

    def test_clip_rect_keeps_inside_and_trims_outside(self):
        out = geo.clip_rect([[-1, -1], [-1, 2], [2, 2], [2, -1], [-1, -1]], 0, 0, 1, 1)
        xs = [p[0] for p in out]
        ys = [p[1] for p in out]
        self.assertGreaterEqual(min(xs), 0)
        self.assertLessEqual(max(xs), 1)
        self.assertGreaterEqual(min(ys), 0)
        self.assertLessEqual(max(ys), 1)


class TileTests(unittest.TestCase):
    def test_each_point_has_exactly_one_tile_and_is_stable(self):
        a = tiles.tile_of(51.5075, 0.0745, 51.49, -0.03)
        b = tiles.tile_of(51.5075, 0.0745, 51.49, -0.03)
        self.assertEqual(a, b)
        self.assertEqual(a, (int((0.0745 + 0.03) // tiles.DLON), int((51.5075 - 51.49) // tiles.DLAT)))

    def test_mid_uses_middle_vertex(self):
        self.assertEqual(tiles.mid([[1, 2], [3, 4], [5, 6]]), (3, 4))


class XrefTests(unittest.TestCase):
    def test_evidence_is_shared_table_triples(self):
        e = xref.E("OpenStreetMap", 1, "No access restriction")
        e2 = xref.E("OpenStreetMap", -1, "Tagged access: private")
        self.assertEqual(e[0], e2[0])               # same source, same index
        self.assertNotEqual(e[2], e2[2])
        self.assertEqual(xref.SRC[e[0]], "OpenStreetMap")

    def test_private_access_tag_votes_private(self):
        cls, conf, ev, conflict = xref.road_evidence("Some Road", {"highway": "service", "access": "private"}, 0.0, None, set(), set())
        self.assertEqual(cls, "private")

    def test_adopted_edge_and_classified_votes_adopted(self):
        cls, conf, ev, conflict = xref.road_evidence("Big Road", {"highway": "primary"}, 1.0, None, set(), set())
        self.assertEqual(cls, "newham")


if __name__ == "__main__":
    unittest.main()
