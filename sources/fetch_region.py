"""Fetch every raw source for the whole of Newham (plus a small margin) into data/region/. Cached: re-run is cheap.

Why chunks: Overpass times out on one big box, so the borough is cut into a 3 x 4 grid and merged by way id.
Each source keeps its raw file, so build.py never touches the network.
"""
import json, pathlib, subprocess, sys, time, urllib.parse, re

HERE = pathlib.Path(__file__).parent.parent
OUT = HERE / "data" / "region"
OUT.mkdir(parents=True, exist_ok=True)
S, N, W, E = 51.490, 51.570, -0.030, 0.105           # Newham plus ~0.5 km margin
ROWS, COLS = 3, 4
ARC = "https://services1.arcgis.com/trOdpHvvP7HrTfdb/ArcGIS/rest/services"
HW = "motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|service|primary_link|trunk_link|secondary_link|tertiary_link"


def curl(url, out, tries=3, timeout=240):
    for i in range(tries):
        r = subprocess.run(["curl", "-s", "--max-time", str(timeout), "-A", "hermes-research/1.0", "-G", url[0], *url[1], "-o", str(out)])
        if r.returncode == 0 and out.exists() and out.stat().st_size > 200:
            head = out.read_text(encoding="utf8", errors="ignore")[:200]
            if '"elements"' in head or '"features"' in head or '"count"' in head or head.lstrip().startswith("{"):
                return True
        time.sleep(8 * (i + 1))
    return False


def osm_chunk(r, c):
    f = OUT / f"osm_{r}_{c}.json"
    if f.exists() and f.stat().st_size > 1000:
        return f
    s0, s1 = S + (N - S) * r / ROWS, S + (N - S) * (r + 1) / ROWS
    w0, w1 = W + (E - W) * c / COLS, W + (E - W) * (c + 1) / COLS
    ok = osm_box(f, s0, w0, s1, w1)
    if not ok or f.stat().st_size < 1000:                 # dense chunk timed out: split into four and fetch each
        f.unlink(missing_ok=True)
        sm, wm = (s0 + s1) / 2, (w0 + w1) / 2
        for i, (a, b, c2, d) in enumerate([(s0, w0, sm, wm), (s0, wm, sm, w1), (sm, w0, s1, wm), (sm, wm, s1, w1)]):
            osm_box(OUT / f"osm_{r}_{c}_{i}.json", a, b, c2, d)
            time.sleep(4)
    return f


def osm_box(f, s0, w0, s1, w1):
    if f.exists() and f.stat().st_size > 1000:
        return True
    bb = f"({s0:.5f},{w0:.5f},{s1:.5f},{w1:.5f})"
    q = (f'[out:json][timeout:200];(way["highway"~"^({HW})$"]{bb};way["amenity"~"^(parking|parking_space)$"]{bb};'
         f'way["landuse"~"^(retail|industrial|commercial|railway|brownfield)$"]{bb};way["railway"="yard"]{bb};'
         f'nwr["amenity"~"^(charging_station|bicycle_parking|taxi|motorcycle_parking)$"]{bb};);out tags geom;')
    ok = curl(("https://overpass-api.de/api/interpreter", ["--data-urlencode", "data=" + q]), f)
    print("osm", f.name, "ok" if ok else "FAILED", f.stat().st_size if f.exists() else 0, flush=True)
    return ok


def arc_all(layer, name, out_fields="*"):
    f = OUT / f"{name}.geojson"
    if f.exists() and f.stat().st_size > 500:
        return
    feats, off = [], 0
    while True:
        tmp = OUT / "_tmp.json"
        ok = curl((f"{ARC}/{layer}/FeatureServer/0/query", ["--data-urlencode", "where=1=1", "--data-urlencode", f"outFields={out_fields}",
                   "--data-urlencode", "outSR=4326", "--data-urlencode", "f=geojson", "--data-urlencode", f"resultOffset={off}",
                   "--data-urlencode", "resultRecordCount=2000"]), tmp)
        if not ok:
            print(name, "FAILED at", off); break
        d = json.loads(tmp.read_text(encoding="utf8"))
        got = d.get("features", [])
        feats += got
        if len(got) < 2000 and not d.get("exceededTransferLimit"):
            break
        off += len(got)
    f.write_text(json.dumps({"type": "FeatureCollection", "features": feats}), encoding="utf8")
    print(name, len(feats), flush=True)


def zone_files():
    """Every zone xlsx linked from Newham's RPZ page."""
    f = OUT / "zone_files.txt"
    if not f.exists():
        r = subprocess.run(["curl", "-sL", "-A", "Mozilla/5.0", "https://www.newham.gov.uk/parking-permits/resident-parking-zones"], capture_output=True, text=True)
        links = sorted(set(re.findall(r'https://www\.newham\.gov\.uk/downloads/file/\d+/[^"\']+', r.stdout)))
        f.write_text("\n".join(links), encoding="utf8")
    return f.read_text(encoding="utf8").split()


if __name__ == "__main__":
    which = sys.argv[1:] or ["arc", "zones", "osm"]
    if "arc" in which:
        arc_all("Highway_Boundary", "highway_boundary", "TYPE")
        arc_all("Controlled_Parking_Zones", "cpz")
        arc_all("EstateHardSurface_view", "estates", "Site")
    if "zones" in which:
        for u in zone_files():
            p = OUT / ("zl_" + u.rsplit("/", 1)[1] + ".xlsx")
            if not p.exists():
                subprocess.run(["curl", "-sL", "-A", "Mozilla/5.0", u, "-o", str(p)])
        print("zone lists", len(list(OUT.glob("zl_*.xlsx"))))
    if "osm" in which:
        for r in range(ROWS):
            for c in range(COLS):
                osm_chunk(r, c)
                time.sleep(4)


def tfl_london():
    """Every way tagged operator=Transport for London across Greater London (Red Routes), geometry only."""
    f = OUT / "tfl_london.json"
    if f.exists() and f.stat().st_size > 10000:
        return
    q = '[out:json][timeout:240];way["highway"]["operator"="Transport for London"](51.28,-0.52,51.70,0.34);out tags geom;'
    ok = curl(("https://overpass-api.de/api/interpreter", ["--data-urlencode", "data=" + q]), f, timeout=280)
    print("tfl_london", ok, f.stat().st_size if f.exists() else 0)


if __name__ == "__main__" and "tfl" in sys.argv[1:]:
    tfl_london()
