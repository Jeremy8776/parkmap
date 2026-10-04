"""Parse the WKT that planning.data.gov.uk returns, and index polygons for point-in-polygon tests."""
import re, math, collections


def parse_multipolygon(wkt):
    """Return a list of polygons; each polygon is a list of rings; each ring is a list of (lon, lat)."""
    wkt = wkt.strip()
    body = wkt[wkt.index("(("):]
    polys = []
    for poly in re.findall(r"\(\(([^()]*(?:\)\s*,\s*\([^()]*)*)\)\)", body):
        rings = [[tuple(map(float, p.split())) for p in r.split(",")] for r in re.split(r"\)\s*,\s*\(", poly)]
        polys.append(rings)
    return polys


def _pip(lon, lat, ring):
    ins = False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i]
        xj, yj = ring[j]
        if (yi > lat) != (yj > lat) and lon < (xj - xi) * (lat - yi) / (yj - yi) + xi:
            ins = not ins
        j = i
    return ins


class PolyIndex:
    """Grid index over polygons (outer ring + holes) for fast 'which polygon holds this point'."""

    def __init__(self, polys_with_ids, cell=0.002):
        self.cell = cell
        self.grid = collections.defaultdict(list)
        for pid, rings in polys_with_ids:
            xs = [p[0] for p in rings[0]]
            ys = [p[1] for p in rings[0]]
            for gx in range(int(min(xs) // cell), int(max(xs) // cell) + 1):
                for gy in range(int(min(ys) // cell), int(max(ys) // cell) + 1):
                    self.grid[(gx, gy)].append((pid, rings, min(xs), max(xs), min(ys), max(ys)))

    def find(self, lon, lat):
        for pid, rings, x0, x1, y0, y1 in self.grid.get((int(lon // self.cell), int(lat // self.cell)), ()):
            if x0 <= lon <= x1 and y0 <= lat <= y1 and _pip(lon, lat, rings[0]) and not any(_pip(lon, lat, h) for h in rings[1:]):
                return pid
        return None
