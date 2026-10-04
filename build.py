"""Build ParkMap's Newham coverage: classify roads, tile the data, write the page.

Run: python sources/fetch_region.py   (once, downloads raw data into data/region)
     python build.py                  (offline, writes the site into docs/: index.html, tiles/, PWA files)
Classification rules and the evidence vote live in classify.py and sources/xref.py.
"""
import json
import re
import sys
import math
import pathlib
import collections

HERE = pathlib.Path(__file__).parent
sys.path.insert(0, str(HERE / "sources"))
from geo import P, pip, ring_area, KX, KY
import classify as C
import bays as bays_mod
import tiles as T
import xref
import zonelists
import hours as H
from wkt import PolyIndex, parse_multipolygon

REGION = HERE / "data" / "region"
SITE = HERE / "docs"                                  # built site: served by GitHub Pages and wrapped by the Android app
BB = (51.490, -0.030, 51.570, 0.105)                 # S, W, N, E (matches fetch_region.py)
STUDY = (51.5005, 0.0585, 51.5222, 0.0885)           # the original Gallions Reach box, where Land Registry parcels were fetched
inbb = lambda la, lo: BB[0] <= la <= BB[2] and BB[1] <= lo <= BB[3]


def load(p):
    return json.loads(pathlib.Path(p).read_text(encoding="utf8"))


def rings_of(g):
    return g["coordinates"] if g["type"] == "Polygon" else [r for p in g["coordinates"] for r in p]


def load_osm():
    seen, out = set(), []
    for f in sorted(REGION.glob("osm_*.json")):
        try:
            els = load(f)["elements"]
        except Exception:
            continue
        for e in els:
            k = (e["type"], e["id"])
            if k not in seen:
                seen.add(k)
                out.append(e)
    return out


def finish_site(html, idx):
    """Copy PWA assets from web/ and stamp the service worker with a content hash and the list of tile files to precache."""
    import hashlib, shutil
    for f in (HERE / "web").rglob("*"):
        if f.is_file() and f.name != "sw.js":
            dst = SITE / f.relative_to(HERE / "web")
            dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(f, dst)
    tiles = sorted(p.name for p in (SITE / "tiles").glob("t_*.js"))
    ver = hashlib.sha1(html.encode("utf8")).hexdigest()[:10]
    sw = (HERE / "web" / "sw.js").read_text(encoding="utf8").replace("__VERSION__", ver).replace("__TILES__", json.dumps(["tiles/" + t for t in tiles]))
    (SITE / "sw.js").write_text(sw, encoding="utf8")


def main():
    osm = load_osm()
    print("osm elements", len(osm), "chunks", len(list(REGION.glob("osm_*.json"))))
    # ---- Newham boundary, highway boundary, zones
    boro = [r for f in load("data/boro.geojson")["features"] for r in rings_of(f["geometry"])]
    bidx = C.BoroughIndex(boro)
    hb_lines = []
    for f in load(REGION / "highway_boundary.geojson")["features"]:
        g = f["geometry"]
        if not g:
            continue
        for l in (g["coordinates"] if g["type"] == "MultiLineString" else [g["coordinates"]]):
            hb_lines.append([P(c[1], c[0]) for c in l])
    hbg = C.Grid(hb_lines)
    zones = []
    for i, f in enumerate(x for x in load(REGION / "cpz.geojson")["features"] if x["geometry"]):
        p, rs = f["properties"], rings_of(f["geometry"])
        hrs = H.parse_hours(p["TIMES"])
        zones.append({"idx": i, "name": H.zone_name(p), "prefix": (p.get("PREFIX") or "").strip(), "times": p["TIMES"], "date": p.get("DATE"),
                      "hours": hrs, "text": H.describe(hrs), "event": "Event Day" in (p.get("CPZ_Status") or ""), "rings": rs,
                      "area": ring_area([P(c[1], c[0]) for c in rs[0]])})
    zidx = C.ZoneIndex(zones)
    gz = xref.gazette_streets()
    tfl_ids = xref.tfl_api_corridors()
    titles_raw = load(HERE / "sources/raw/pd_title-boundary.json")
    lr = (PolyIndex([(e["reference"], p) for e in titles_raw for p in parse_multipolygon(e["geometry"])]), STUDY)
    # ---- roads, land
    roads, tfl30, cstats = C.classify(osm, hbg, bidx, zidx, gz, tfl_ids, inbb, lr)
    land = C.land_from_osm(osm, inbb)
    for f in (x for x in load(REGION / "estates.geojson")["features"] if x["geometry"]):
        r = rings_of(f["geometry"])[0]
        c = r[len(r) // 2]
        if inbb(c[1], c[0]) and ring_area([P(x[1], x[0]) for x in r]) > 200:
            land.append({"k": "estate", "n": (f["properties"].get("Site") or "").strip().title(), "op": "Newham Housing",
                         "g": [[round(a[1], 5), round(a[0], 5)] for a in r]})
    # ---- pay-by-phone (all zones), then bays using it
    pbp_all, pbp_raw, pbp_files = zonelists.load_all()
    name_set = {xref.norm(r["n"]) for r in roads}
    pbp = [r for r in pbp_all if xref.norm(re.sub(r" \d+$", "", r["street"])) in name_set]
    pbp_streets = {re.sub(r" \d+$", "", p["street"]) for p in pbp}
    markers, shapes, klines, bstats = bays_mod.build(osm, roads, land, pbp_streets, BB)
    print("roads", dict(collections.Counter(r["c"] for r in roads)), "land", len(land), "markers", len(markers), "shapes", len(shapes), "kerb", len(klines))
    # ---- zone info for the page
    zinfo = [{"i": z["idx"], "n": z["name"], "p": z["prefix"], "t": z["text"], "e": z["event"], "h": z["hours"]} for z in zones]
    zpoly = [{"i": z["idx"], "g": [[[round(c[1], 5), round(c[0], 5)] for c in r] for r in z["rings"]]} for z in zones]
    # ---- street search index (one entry per name)
    best = {}
    for r in roads:
        if r["n"].startswith("Unnamed"):
            continue
        k = r["n"]
        if k not in best or len(r["g"]) > best[k][3]:
            best[k] = [r["n"], r["g"][len(r["g"]) // 2][0], r["g"][len(r["g"]) // 2][1], len(r["g"]), r["c"]]
    streets = sorted([b[:3] + [b[4]] for b in best.values()])
    places = sorted({(a["n"], a["g"][len(a["g"]) // 2][0], a["g"][len(a["g"]) // 2][1]) for a in land if a["n"] and a["k"] != "estate"})
    # ---- stats, sources
    km = collections.Counter()
    for r in roads:
        km[r["c"]] += sum(math.hypot(*[(a - b) for a, b in zip(P(*p), P(*q))]) for p, q in zip(r["g"], r["g"][1:])) / 1000
    n_zone_named = len({z["name"] for z in zones})
    sources = [
        {"n": "OpenStreetMap", "r": f"{len(osm):,} features over the whole borough", "u": "Road geometry, TfL operator tag, access tags, bays, chargers, kerb restrictions"},
        {"n": "Newham highway map", "r": f"{len(hb_lines):,} adopted-highway boundary lines", "u": "Which roads the council has adopted"},
        {"n": "Land Registry (via planning.data.gov.uk)", "r": f"{len(titles_raw):,} freehold parcels, Gallions Reach area only", "u": "Weak signal: covers most adopted roads too and names no owner"},
        {"n": "Newham parking zones", "r": f"{len(zones)} zone polygons, {n_zone_named} named zones, hours parsed from Newham's text", "u": "Zone boundaries and hours"},
        {"n": "Newham pay-by-phone lists", "r": f"{pbp_files} zone lists, {pbp_raw:,} records, {len(pbp_all):,} after dedupe, {len(pbp):,} on streets mapped", "u": "Pay-by-phone bays, hours and maximum stay"},
        {"n": "Newham traffic order notice (Gazette, 2017)", "r": f"{len(gz[0])} controlled streets, {len(gz[1])} 'permit issue only' (Beckton extension only)", "u": "Cross-check for adopted or private streets"},
        {"n": "Newham parking policy (Oct 2025)", "r": "TLRN road list, fines, estate rules", "u": "Confirms the TfL roads and fine levels"},
        {"n": "Newham estate land layer", "r": f"{sum(1 for a in land if a['k'] == 'estate')} council estate hard-surface areas", "u": "Council estate land, outside the civil enforcement area"},
        {"n": "TfL Unified API", "r": f"{len(tfl_ids)} road corridors", "u": "Confirms A13 only: the A117 and A1020 are not listed as corridors"},
        {"n": "Operator sites", "r": "Gallions Reach Shopping Park (UKPC), Beckton Gateway", "u": "Car park limits and operators"},
    ]
    checked = ["Newham EV charge points layer (dated Oct 2020): none in the Gallions Reach area", "Newham road signs layer: empty for this area",
               "Newham car parks layer: 6 records, none near Gallions Reach", "TfL car park places: none within 4 km of Gallions Reach",
               "Open Charge Map: needs an API key, not used", "DfT digital traffic orders (D-TRO): API access needs registration, not used yet"]
    xstats = {"votes": cstats["votes"], "conflicts": cstats["conflicts"], "dedupe": bstats, "km": {k: round(v, 1) for k, v in km.items()},
              "evS": xref.SRC, "evT": xref.TXT}
    coverage = [{"b": "Newham", "s": "Full: zones, hours, pay-by-phone, adopted highway", "c": "ok"},
                {"b": "Tower Hamlets, Greenwich, Barking and Dagenham, Havering", "s": "Roads and TfL Red Routes only. Zone rules are not loaded.", "c": "part"},
                {"b": "Rest of London", "s": "TfL Red Routes only (optional layer).", "c": "part"}]
    # ---- tiles + page
    idx = T.write_tiles(SITE / "tiles", BB[0], BB[1], roads, tfl30, land, markers, shapes, klines)
    nb = [[round(c[1], 5), round(c[0], 5)] for r in boro for c in r[::max(1, len(r) // 400)]]
    area = [[[round(c[1], 5), round(c[0], 5)] for c in r[::max(1, len(r) // 500)]] for r in boro if len(r) > 50]
    data = {"area": area, "zones": zpoly, "zinfo": zinfo, "paybyphone": pbp, "sources": sources, "checked": checked, "xstats": xstats,
            "coverage": coverage, "tileIndex": idx, "streets": streets, "places": places, "bb": list(BB)}
    tpl = (HERE / "template.html").read_text(encoding="utf8")
    JS = chr(10).join(p.read_text(encoding="utf8") for p in sorted((HERE / "js").glob("*.js")))
    CSS = (HERE / "ui.css").read_text(encoding="utf8")
    html = tpl.replace("/*CSS*/", CSS).replace("/*JS*/", JS).replace("/*DATA*/null", json.dumps(data, separators=(",", ":")))
    html = html.replace("/*LEAFLET_CSS*/", (HERE / "vendor" / "leaflet.css").read_text(encoding="utf8")).replace("/*LEAFLET_JS*/", (HERE / "vendor" / "leaflet.js").read_text(encoding="utf8"))   # last, so library text is never re-scanned
    (SITE / "index.html").write_text(html, encoding="utf8")
    finish_site(html, idx)
    rep = ["# Cross-reference report", "", "Votes: + adopted, - private.", ""] + [f"- {s['n']}: {s['r']}. {s['u']}." for s in sources]
    rep += ["", "Checked, nothing to add:"] + [f"- {c}" for c in checked] + ["", f"Confidence: {cstats['votes']}. Roads where sources disagree: {cstats['conflicts']}.",
                                                                          f"Dedupe: {bstats}", f"Road km: {xstats['km']}"]
    (HERE / "sources" / "REPORT.md").write_text(chr(10).join(rep), encoding="utf8")
    tl = [w for w in load(REGION / "tfl_london.json")["elements"] if w["tags"].get("highway") in C.VEH]
    print("london TfL ways", len(tl), "->", T.write_tfl_london(SITE / "tiles", tl))
    size = sum(f.stat().st_size for f in (SITE / "tiles").glob("t_*.js"))
    print("tiles", len(idx["tiles"]), "tile MB", round(size / 1e6, 1), "html KB", round(len(html) / 1e3), "confidence", cstats["votes"], "conflicts", cstats["conflicts"], bstats)


if __name__ == "__main__":
    main()
