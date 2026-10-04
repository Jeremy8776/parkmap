"""Fetch planning.data.gov.uk datasets for the Gallions Reach bbox into raw/<dataset>.json.
title-boundary is HM Land Registry INSPIRE freehold parcels (OGL). Polite paging, cached."""
import json, sys, time, urllib.parse, urllib.request, pathlib
RAW = pathlib.Path(__file__).parent / "raw"
POLY = "POLYGON((0.0585 51.5005,0.0885 51.5005,0.0885 51.5222,0.0585 51.5222,0.0585 51.5005))"

def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "hermes-research/1.0", "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)

def fetch(dataset, limit=500, cap=20000):
    out, offset = [], 0
    while offset < cap:
        q = urllib.parse.urlencode({"dataset": dataset, "geometry": POLY, "geometry_relation": "intersects", "limit": limit, "offset": offset})
        try:
            d = get("https://www.planning.data.gov.uk/entity.json?" + q)
        except Exception as e:
            print(dataset, "error", e); break
        ents = d.get("entities", [])
        out += ents
        if len(ents) < limit:
            break
        offset += limit
        time.sleep(.4)
    (RAW / f"pd_{dataset}.json").write_text(json.dumps(out), encoding="utf8")
    print(dataset, len(out))

if __name__ == "__main__":
    for ds in sys.argv[1:] or ["title-boundary", "street", "brownfield-land", "transport-access-node", "open-space"]:
        fetch(ds)
