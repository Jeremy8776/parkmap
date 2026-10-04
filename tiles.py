"""Cut region data into map tiles (small JS files loaded on demand) so the page scales past one neighbourhood.

Each feature is assigned to exactly ONE tile, by its midpoint, so tiles never duplicate a feature. Roads that cross a tile
edge are drawn whole by the tile that owns them. Tiles are plain scripts calling __tile(gx, gy, data), not JSON, because
browsers block fetch() on file:// pages while script tags still load.
"""
import json
import pathlib
import collections

DLAT, DLON = 0.02, 0.03


def tile_of(lat, lon, S, W):
    return int((lon - W) // DLON), int((lat - S) // DLAT)


def mid(g):
    p = g[len(g) // 2]
    return p[0], p[1]


def write_tiles(out, S, W, roads, tfl30, land, markers, shapes, klines):
    out = pathlib.Path(out)
    out.mkdir(exist_ok=True)
    for f in out.glob("t_*.js"):
        f.unlink()
    buckets = collections.defaultdict(lambda: {"r": [], "s": [], "l": [], "m": [], "b": [], "k": []})
    for r in roads:
        buckets[tile_of(*mid(r["g"]), S, W)]["r"].append(r)
    for s in tfl30:
        buckets[tile_of(*mid(s["g"]), S, W)]["s"].append(s)
    for a in land:
        buckets[tile_of(*mid(a["g"]), S, W)]["l"].append(a)
    for m in markers:
        buckets[tile_of(m["lat"], m["lon"], S, W)]["m"].append(m)
    for b in shapes:
        buckets[tile_of(*mid(b["g"]), S, W)]["b"].append(b)
    for k in klines:
        buckets[tile_of(*mid(k["g"]), S, W)]["k"].append(k)
    index = []
    for (gx, gy), d in sorted(buckets.items()):
        body = json.dumps(d, separators=(",", ":"))
        (out / f"t_{gx}_{gy}.js").write_text(f"__tile({gx},{gy},{body});", encoding="utf8")
        index.append([gx, gy, len(d["r"])])
    return {"S": S, "W": W, "dlat": DLAT, "dlon": DLON, "tiles": index}


def write_tfl_london(out, ways):
    """Thin London-wide Red Route layer: just name, ref and a line, loaded only when asked for."""
    out = pathlib.Path(out)
    rows = [[w["tags"].get("name") or "", w["tags"].get("ref") or "", [[round(g["lat"], 5), round(g["lon"], 5)] for g in w["geometry"]]]
            for w in ways if "geometry" in w]
    (out / "tfl_london.js").write_text("__tfl(" + json.dumps(rows, separators=(",", ":")) + ");", encoding="utf8")
    return len(rows)
