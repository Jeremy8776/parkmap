"""Cross-reference several sources about each road, and dedupe overlapping records.

Sources and what each can and cannot say about a road:
  osm      OpenStreetMap: operator (TfL), access tags, road class. Volunteer data.
  newham   Newham Council open GIS Highway_Boundary: the council's adopted-highway edge lines.
  lr       HM Land Registry INSPIRE freehold parcels (via planning.data.gov.uk). Says land is
           REGISTERED, not who owns it. In this area it also covers most adopted roads, so it is weak.
  gazette  The 2017 Newham traffic-order notice: streets in the Beckton zone, some marked
           "permit issue only" (a hint that the length is private or TfL).
  policy   Newham parking policy (Oct 2025): the TLRN road list.
  tfl      TfL Unified API road corridors (only the big corridors are listed, so partial).
Each source casts a vote for 'adopted' (+) or 'private' (-). Votes are weighed, the result is
the class, and the margin is the confidence. Disagreements are kept so the page can show them.
"""
import re
import json
import math
import pathlib

RAW = pathlib.Path(__file__).parent / "raw"
PRIVATE_ACCESS = {"private", "no", "customers", "destination", "delivery"}
POLICY_TLRN = ["A1020 Royal Docks Road", "A117 Woolwich Manor Way (south of Gallions Roundabout)",
               "A117 Albert Road / Pier Road", "A13 Newham Way"]


def norm(n):
    return re.sub(r"[^a-z0-9 ]", "", (n or "").lower()).strip()


def gazette_streets():
    """(in_zone, permit_issue_only) as sets of normalised street names, from the Gazette notice text."""
    t = (RAW / "gazette_2879566.txt").read_text(encoding="utf8")
    body = t[t.index("STREETS THAT WILL BE INCLUDED"):]
    body = body.split("(Note: controls will not apply on private lengths of streets)")[1]
    zone, only = set(), set()
    for part in re.split(r",\s*|\sand\s(?=Yarrow)", body):
        part = part.strip().rstrip(".")
        if not part:
            continue
        flag = "(permit issue only)" in part
        name = re.sub(r"\(.*?\)", "", part).strip()
        if flag:
            only.add(norm(name))
        elif name:
            zone.add(norm(name))
    return zone, only


def tfl_api_corridors():
    p = RAW / "tfl_roads.json"
    return {r["id"] for r in json.loads(p.read_text(encoding="utf8"))} if p.exists() else set()


SRC, TXT = [], []          # shared tables: evidence is shipped as [source index, vote, text index] triples


def E(source, vote, text):
    if source not in SRC:
        SRC.append(source)
    if text not in TXT:
        TXT.append(text)
    return [SRC.index(source), vote, TXT.index(text)]


def road_evidence(name, tags, hb_frac, lr_frac, gz_zone, gz_only):
    """Return (class, confidence, evidence[], conflict) for a non-TfL road in Newham. lr_frac None = parcels not fetched here."""
    ev, adopted, private = [], 0.0, 0.0
    acc = tags.get("access")
    classified = tags.get("highway") in ("primary", "secondary", "tertiary", "trunk")
    if acc in PRIVATE_ACCESS:
        private += 2
        ev.append(E("OpenStreetMap", -1, f"Tagged access: {acc}"))
    else:
        adopted += .5 + (.5 if classified else 0)
        ev.append(E("OpenStreetMap", 1, "No access restriction" + (", classified road" if classified else "")))
    if hb_frac >= .8:
        adopted += 2
        ev.append(E("Newham highway map", 1, "Runs along the adopted-highway edge"))
    elif hb_frac < .3:
        private += 1.5
        ev.append(E("Newham highway map", -1, "No adopted-highway edge along it"))
    else:
        ev.append(E("Newham highway map", 0, "Partly along the adopted-highway edge"))
    k = norm(name)
    if k in gz_zone:
        adopted += 1
        ev.append(E("Newham traffic order 2017", 1, "Listed as a controlled street"))
    elif k in gz_only:
        private += 1.5
        ev.append(E("Newham traffic order 2017", -1, "Listed as 'permit issue only' (controls do not apply)"))
    if lr_frac is not None:
        if lr_frac >= .99:
            private += .5
            ev.append(E("Land Registry", 0, "Sits on registered land (also true of most adopted roads here)"))
        elif lr_frac < .9:
            adopted += 1
            ev.append(E("Land Registry", 1, "Partly off registered parcels"))
        else:
            ev.append(E("Land Registry", 0, "Mostly on registered parcels"))
    cls = "newham" if adopted > private else "private"
    diff = abs(adopted - private)
    conf = "high" if diff >= 3 else "medium" if diff >= 1.5 else "low"
    conflict = any(e[1] > 0 for e in ev) and any(e[1] < 0 for e in ev)
    return cls, conf, ev, conflict


def tfl_evidence(name, ref, tfl_ids):
    ev = [E("OpenStreetMap", 1, "Operator tag: Transport for London")]
    pol = norm(name) in {norm(x.split(" ", 1)[1].split(" (")[0]) for x in POLICY_TLRN} or (ref or "") in ("A13", "A117", "A1020")
    ev.append(E("Newham parking policy", 1 if pol else 0, "On the TLRN list" if pol else "Not named on the TLRN list"))
    if ref and ref.lower() in tfl_ids:
        ev.append(E("TfL API", 1, f"{ref} is a TfL road corridor"))
    return ev


def dedupe_points(items, tol_m=3.0, key=lambda i: (i.get("op") or "")):
    """Drop point records that are the same thing mapped twice: same operator, within tol_m metres.
    Returns (kept, dropped_count)."""
    from geo import P
    kept, dropped = [], 0
    for it in items:
        x, y = P(it["lat"], it["lon"])
        for k in kept:
            if key(k) == key(it) and math.hypot(x - k["_x"], y - k["_y"]) <= tol_m:
                k["dupes"] = k.get("dupes", 0) + 1
                dropped += 1
                break
        else:
            it = dict(it)
            it["_x"], it["_y"] = x, y
            kept.append(it)
    for k in kept:
        k.pop("_x"), k.pop("_y")
    return kept, dropped
