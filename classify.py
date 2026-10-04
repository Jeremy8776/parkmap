"""Classify every vehicle road in the region by who manages it, using several sources (see xref.py).

Classes: tfl (OSM operator = TfL), newham (adopted, per the evidence vote), private (not adopted, inferred),
other (outside the Newham boundary). Also: the first ~30 m of Newham roads leaving a TfL road (Red Route rule),
private land polygons, and the zone each Newham road sits in.
"""
import math
import collections
from geo import P, KX, KY, pip, ring_area, densify, seg_dist
import xref

VEH = {"trunk", "primary", "secondary", "tertiary", "unclassified", "residential", "service", "living_street",
       "primary_link", "trunk_link", "secondary_link", "tertiary_link"}
SKIP_SERVICE = {"driveway", "emergency_access", "slipway"}


class Grid:
    def __init__(self, polylines, cs=60):
        self.cs, self.g = cs, collections.defaultdict(list)
        for l in polylines:
            for a, b in zip(l, l[1:]):
                for gx in range(int(min(a[0], b[0]) // cs) - 1, int(max(a[0], b[0]) // cs) + 2):
                    for gy in range(int(min(a[1], b[1]) // cs) - 1, int(max(a[1], b[1]) // cs) + 2):
                        self.g[(gx, gy)].append((a, b))

    def dist(self, p):
        best, gx, gy = 1e9, int(p[0] // self.cs), int(p[1] // self.cs)
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for a, b in self.g.get((gx + dx, gy + dy), ()):
                    d = seg_dist(p, a, b)
                    if d < best:
                        best = d
        return best


class BoroughIndex:
    """Is a point inside Newham? Outer rings only, bbox prefilter."""

    def __init__(self, rings):
        self.r = [(min(c[0] for c in r), max(c[0] for c in r), min(c[1] for c in r), max(c[1] for c in r), r) for r in rings]

    def inside(self, lat, lon):
        return any(x0 <= lon <= x1 and y0 <= lat <= y1 and pip(lon, lat, [r]) for x0, x1, y0, y1, r in self.r)


class ZoneIndex:
    """Smallest zone polygon containing a point; bbox prefilter."""

    def __init__(self, zones):
        self.z = []
        for z in zones:
            xs = [c[0] for c in z["rings"][0]]
            ys = [c[1] for c in z["rings"][0]]
            self.z.append((z["area"], min(xs), max(xs), min(ys), max(ys), z))
        self.z.sort(key=lambda t: t[0])

    def at(self, lat, lon):
        for _, x0, x1, y0, y1, z in self.z:
            if x0 <= lon <= x1 and y0 <= lat <= y1 and pip(lon, lat, z["rings"]):
                return z["idx"]
        return None


def land_from_osm(osm, inbb):
    land = []
    for e in osm:
        t = e["tags"]
        if e["type"] != "way" or "geometry" not in e or len(e["geometry"]) < 4:
            continue
        kind = None
        if t.get("landuse") in ("retail", "industrial", "commercial"):
            kind = t["landuse"]
        elif t.get("landuse") == "railway" or t.get("railway") == "yard":
            kind = "dlr"
        elif t.get("landuse") == "brownfield" and t.get("name"):
            kind = "brownfield"
        elif t.get("amenity") == "parking" and t.get("parking") in ("surface", "multi-storey", "underground") \
                and (t.get("access") in ("private", "customers") or t.get("name")):
            kind = "carpark"
        if not kind:
            continue
        g = e["geometry"]
        if ring_area([P(x["lat"], x["lon"]) for x in g]) < 600:
            continue
        c = g[len(g) // 2]
        if not inbb(c["lat"], c["lon"]):
            continue
        land.append({"k": kind, "n": t.get("name"), "op": t.get("operator"), "acc": t.get("access"), "fee": t.get("fee"),
                     "cap": t.get("capacity"), "max": t.get("maxstay"),
                     "g": [[round(x["lat"], 5), round(x["lon"], 5)] for x in g]})
    return land


def classify(osm, hbg, bidx, zidx, gz, tfl_ids, inbb, lr=None):
    """lr = (PolyIndex, (s, w, n, e)) for Land Registry parcels where fetched, else None."""
    gz_zone, gz_only = gz
    tfl_vertices = {(g["lat"], g["lon"]) for e in osm if e["type"] == "way" and e["tags"].get("highway") in VEH
                    and e["tags"].get("operator") == "Transport for London" and "geometry" in e for g in e["geometry"]}
    roads, tfl30, seen = [], [], set()
    stats = {"votes": {"high": 0, "medium": 0, "low": 0}, "conflicts": 0}
    for e in osm:
        t = e["tags"]
        if e["type"] != "way" or t.get("highway") not in VEH or t.get("service") in SKIP_SERVICE or "geometry" not in e:
            continue
        geom = e["geometry"]
        mid = geom[len(geom) // 2]
        if not inbb(mid["lat"], mid["lon"]) or e["id"] in seen:
            continue
        seen.add(e["id"])
        pts = [P(g["lat"], g["lon"]) for g in geom]
        name0, conf, conflict = t.get("name") or "", "high", False
        if t.get("operator") == "Transport for London":
            cls, ev = "tfl", xref.tfl_evidence(name0, t.get("ref"), tfl_ids)
        elif not bidx.inside(mid["lat"], mid["lon"]):
            cls, ev = "other", [xref.E("Newham boundary", 0, "Outside the Newham borough boundary")]
        else:
            ss = densify(pts, 8)
            hb_frac = sum(hbg.dist(p) <= 15 for p in ss) / len(ss)
            lr_frac = None
            if lr and lr[1][0] <= mid["lat"] <= lr[1][2] and lr[1][1] <= mid["lon"] <= lr[1][3]:
                lr_frac = sum(lr[0].find(p[0] / KX, p[1] / KY) is not None for p in ss) / len(ss)
            cls, conf, ev, conflict = xref.road_evidence(name0, t, hb_frac, lr_frac, gz_zone, gz_only)
            stats["votes"][conf] += 1
            stats["conflicts"] += int(conflict)
        z = zidx.at(mid["lat"], mid["lon"]) if cls == "newham" else None
        name = name0 or ("Unnamed " + ("service road" if t["highway"] == "service" else "road"))
        roads.append({"n": name, "c": cls, "z": z, "h": t["highway"], "ref": t.get("ref"), "a": t.get("access"),
                      "ev": ev, "cf": conf, "x": conflict, "g": [[round(g["lat"], 5), round(g["lon"], 5)] for g in geom]})
        if cls == "newham":
            ll = [(g["lat"], g["lon"]) for g in geom]
            for vi, v in enumerate(ll):
                if v in tfl_vertices:
                    for direction in (1, -1):
                        seg, acc, i = [v], 0.0, vi
                        while 0 <= i + direction < len(ll) and acc < 30:
                            a, b = P(*ll[i]), P(*ll[i + direction])
                            acc += math.hypot(b[0] - a[0], b[1] - a[1])
                            i += direction
                            seg.append(ll[i])
                        if len(seg) > 1:
                            tfl30.append({"n": name, "g": [[round(a, 5), round(b, 5)] for a, b in seg]})
    return roads, tfl30, stats
