"""Parking bays, kerb restrictions and charge points for a whole region.

Input: OpenStreetMap elements (deduped by id) plus the classified roads and private land from classify.py.
Output:
  markers  one symbol per cluster of same-type bays (type, count, street, who enforces)
  shapes   individual bay polygons (drawn only when zoomed in)
  lines    kerb restriction lines offset to the side they apply to:
           no_stopping = red line / clearway (sits on TfL roads in practice), no_parking = yellow line
Invariant: a bay's rule is INFERRED from the road or land it sits on. OSM has no per-bay signage, so a Newham bay
inside a zone is shown as a permit bay and the page says so. Spatial indexes keep this near-linear for 25k roads.
"""
import math
import collections
from geo import P, KX, KY, seg_dist, ring_area, pip
import xref

ONSTREET = {"street_side", "lane", "half_on_kerb", "on_kerb"}
CLUSTER_M = {"permit": 45, "private": 45, "disabled": 40, "ev": 35, "cycle": 40, "customer": 60, "carpark": 60, "taxi": 30}
LINE_HW = {"trunk", "primary", "secondary", "tertiary", "unclassified", "residential", "service", "trunk_link", "primary_link"}
CELL = 60.0


def centre(geom):
    return (sum(g["lat"] for g in geom) / len(geom), sum(g["lon"] for g in geom) / len(geom))


class RoadIndex:
    """Segment grid so 'nearest road within 35 m' is a handful of tests, not 250k."""

    def __init__(self, roads):
        self.g = collections.defaultdict(list)
        for r in roads:
            pts = [P(*p) for p in r["g"]]
            for a, b in zip(pts, pts[1:]):
                for gx in range(int(min(a[0], b[0]) // CELL), int(max(a[0], b[0]) // CELL) + 1):
                    for gy in range(int(min(a[1], b[1]) // CELL), int(max(a[1], b[1]) // CELL) + 1):
                        self.g[(gx, gy)].append((r, a, b))

    def nearest(self, lat, lon, maxd=35):
        p = P(lat, lon)
        best, bd = None, maxd
        gx, gy = int(p[0] // CELL), int(p[1] // CELL)
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for r, a, b in self.g.get((gx + dx, gy + dy), ()):
                    d = seg_dist(p, a, b)
                    if d < bd:
                        best, bd = r, d
        return best


class LandIndex:
    PRIVATE = ("retail", "commercial", "industrial", "dlr", "brownfield")

    def __init__(self, land):
        self.items = []
        for a in land:
            if a["k"] in self.PRIVATE:
                ys = [p[0] for p in a["g"]]
                xs = [p[1] for p in a["g"]]
                self.items.append((min(xs), max(xs), min(ys), max(ys), a, [[(c[1], c[0]) for c in a["g"]]]))

    def at(self, lat, lon):
        for x0, x1, y0, y1, a, ring in self.items:
            if x0 <= lon <= x1 and y0 <= lat <= y1 and pip(lon, lat, ring):
                return a
        return None


def offset_line(pts, side, dist=4.5):
    """pts: list of (lat, lon). side +1 = left of travel, -1 = right."""
    xy = [P(*p) for p in pts]
    out = []
    for i, (x, y) in enumerate(xy):
        a, b = xy[max(i - 1, 0)], xy[min(i + 1, len(xy) - 1)]
        dx, dy = b[0] - a[0], b[1] - a[1]
        L = math.hypot(dx, dy) or 1
        out.append((x + (-dy / L * side) * dist, y + (dx / L * side) * dist))
    return [[round(py / KY, 5), round(px / KX, 5)] for px, py in out]


def cluster(items, radius):
    out = []
    for it in items:
        p = P(it["lat"], it["lon"])
        for c in out:
            if math.hypot(p[0] - c["_x"], p[1] - c["_y"]) <= radius:
                tot = c["n"] + it["n"]
                c["lat"] = (c["lat"] * c["n"] + it["lat"] * it["n"]) / tot
                c["lon"] = (c["lon"] * c["n"] + it["lon"] * it["n"]) / tot
                c["n"] = tot
                c["_x"], c["_y"] = P(c["lat"], c["lon"])
                break
        else:
            d = dict(it)
            d["_x"], d["_y"] = p
            out.append(d)
    return out


def build(osm, roads, land, pbp_streets, bb):
    """bb = (south, west, north, east). Returns markers, shapes, lines, stats."""
    S, W, N, E = bb
    inbb = lambda la, lo: S <= la <= N and W <= lo <= E
    ridx, lidx = RoadIndex(roads), LandIndex(land)
    items, pts_raw, stats = [], [], {}

    def road_rule(lat, lon, access):
        r = ridx.nearest(lat, lon)
        parcel = lidx.at(lat, lon)
        if access == "customers":
            return "customer", r, parcel
        if access in ("private", "no") or (parcel and (not r or r["c"] != "newham")):
            return "private", r, parcel
        if r and r["c"] == "newham":
            return "permit", r, parcel
        if r and r["c"] == "tfl":
            return "carpark", r, parcel
        if r and r["c"] == "private":
            return "private", r, parcel
        return "carpark", r, parcel

    def add(t, lat, lon, n, r, **kw):
        items.append({"t": t, "lat": lat, "lon": lon, "n": n, "st": (r or {}).get("n"), "c": (r or {}).get("c"), "z": (r or {}).get("z"), **kw})

    ways = [e for e in osm if e["type"] == "way" and "geometry" in e]
    amen = [e for e in ways if e["tags"].get("amenity") == "parking"]
    spaces = [e for e in ways if e["tags"].get("amenity") == "parking_space"]
    # a parking_space inside an amenity=parking polygon is the same capacity twice: subtract it from the polygon
    inside = collections.defaultdict(list)
    boxes = [(min(g["lon"] for g in a["geometry"]), max(g["lon"] for g in a["geometry"]), min(g["lat"] for g in a["geometry"]),
              max(g["lat"] for g in a["geometry"]), a, [[(g["lon"], g["lat"]) for g in a["geometry"]]]) for a in amen]
    for sp in spaces:
        la, lo = centre(sp["geometry"])
        for x0, x1, y0, y1, a, ring in boxes:
            if x0 <= lo <= x1 and y0 <= la <= y1 and pip(lo, la, ring):
                inside[a["id"]].append(sp["id"])
                break
    stats["spaces_merged_into_polygons"] = sum(len(v) for v in inside.values())

    shapes = []
    for e in amen + spaces:
        t, g = e["tags"], e["geometry"]
        lat, lon = centre(g)
        if not inbb(lat, lon):
            continue
        area = ring_area([P(x["lat"], x["lon"]) for x in g])
        space = t.get("amenity") == "parking_space"
        onstreet = space or t.get("parking") in ONSTREET or (not t.get("parking") and area < 450)
        cap = int(t["capacity"]) if str(t.get("capacity", "")).isdigit() else 1
        if e["id"] in inside:
            cap = max(0, cap - len(inside[e["id"]]))
        if not onstreet:
            cap = int(t["capacity"]) if str(t.get("capacity", "")).isdigit() else None
            if area < 900:
                continue
        typ, r, parcel = road_rule(lat, lon, t.get("access"))
        if not onstreet and typ == "permit":
            typ = "carpark"
        if onstreet or typ == "carpark":
            shapes.append({"t": typ, "g": [[round(x["lat"], 5), round(x["lon"], 5)] for x in g]})
        add(typ if onstreet else (typ if typ in ("customer", "private") else "carpark"), lat, lon, cap or 1, r,
            name=t.get("name"), op=t.get("operator"), mx=t.get("maxstay"), mxc=t.get("maxstay:conditional"), big=not onstreet, capKnown=bool(cap), fee=t.get("fee"))
        dis = t.get("capacity:disabled")
        if dis and dis != "no":
            add("disabled", lat, lon, int(dis) if dis.isdigit() else 1, r, big=not onstreet, name=t.get("name"))

    kinds = {"charging_station": "ev", "bicycle_parking": "cycle", "taxi": "taxi", "motorcycle_parking": "cycle"}
    for e in osm:
        t = e["tags"]
        typ = kinds.get(t.get("amenity"))
        if not typ:
            continue
        lat, lon = centre(e["geometry"]) if "geometry" in e else (e["lat"], e["lon"])
        if not inbb(lat, lon):
            continue
        cap = int(t["capacity"]) if str(t.get("capacity", "")).isdigit() else 1
        _, r, parcel = road_rule(lat, lon, t.get("access"))
        pts_raw.append({"t": typ, "lat": lat, "lon": lon, "n": cap, "op": t.get("operator"), "r": r,
                        "priv": bool(parcel) or t.get("access") == "private", "parcel": (parcel or {}).get("n")})
    for typ in ("ev", "cycle", "taxi"):                       # same operator within 3 m = one device mapped twice
        kept, dropped = xref.dedupe_points([p for p in pts_raw if p["t"] == typ])
        stats["dup_" + typ] = dropped
        for k in kept:
            add(typ, k["lat"], k["lon"], k["n"], k["r"], op=k["op"], priv=k["priv"], parcel=k["parcel"])

    markers = []
    for typ in CLUSTER_M:
        for big in (False, True):
            by = collections.defaultdict(list)
            for i in items:
                if i["t"] == typ and bool(i.get("big")) == big:
                    by[i.get("st") or "?"].append(i)
            for st, lst in by.items():
                for c in cluster(lst, CLUSTER_M[typ] if not big else 8):
                    c.pop("_x"), c.pop("_y")
                    c["lat"], c["lon"] = round(c["lat"], 5), round(c["lon"], 5)
                    c["pbp"] = c["st"] in pbp_streets
                    markers.append(c)

    lines = []
    for e in ways:
        t = e["tags"]
        if t.get("highway") not in LINE_HW:
            continue
        g = e["geometry"]
        lat, lon = centre(g)
        if not inbb(lat, lon):
            continue
        pts = [(x["lat"], x["lon"]) for x in g]
        for side, sign in (("left", 1), ("right", -1), ("both", 0)):
            r = t.get(f"parking:{side}:restriction")
            if r not in ("no_parking", "no_stopping"):
                continue
            for sg in ((1, -1) if side == "both" else (sign,)):
                lines.append({"k": "stop" if r == "no_stopping" else "wait", "n": t.get("name") or "Unnamed road",
                              "tfl": t.get("operator") == "Transport for London", "g": offset_line(pts, sg)})
    return markers, shapes, lines, stats
