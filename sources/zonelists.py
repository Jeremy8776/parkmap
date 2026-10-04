"""Newham pay-by-phone location lists (xlsx per zone). Parsed with the stdlib: an xlsx is a zip of XML."""
import re, html, zipfile, io, pathlib, urllib.request, json
RAW = pathlib.Path(__file__).parent / "raw"
DATA = pathlib.Path(__file__).parent.parent / "data" / "region"


def parse(path):
    z = zipfile.ZipFile(path)
    ss = z.read("xl/sharedStrings.xml").decode("utf8")
    txt = [html.unescape(re.sub(r"<[^>]+>", "", i)).strip() for i in re.findall(r"<si>(.*?)</si>", ss, flags=re.S)]
    sh = z.read("xl/worksheets/sheet1.xml").decode("utf8")
    rows = []
    for r in re.findall(r"<row[^>]*>(.*?)</row>", sh, flags=re.S):
        cells = {}
        for m in re.finditer(r'<c r="([A-Z]+)\d+"([^>]*?)(?:/>|>(.*?)</c>)', r, flags=re.S):
            col, attrs, inner = m.groups()
            v = re.search(r"<v>(.*?)</v>", inner or "")
            if v:
                cells[col] = txt[int(v.group(1))] if 't="s"' in attrs else v.group(1)
        rows.append(cells)
    return rows


def load_all():
    """Every pay-by-phone record in every Newham zone list, deduped on (location number, street, position text).
    Returns (records, raw_count, files_read)."""
    seen, out, raw_n, files = set(), [], 0, 0
    for p in sorted(DATA.glob("zl_*.xlsx")):
        try:
            rows = parse(p)
        except Exception:
            continue
        files += 1
        for r in rows[1:]:
            if not r.get("B"):
                continue
            raw_n += 1
            rec = {"loc": r.get("A"), "street": r.get("B"), "where": r.get("D", ""), "hours": r.get("E", ""), "max": r.get("F", ""), "zone": r.get("C", "")}
            key = (rec["loc"], rec["street"].lower(), rec["where"].lower())
            if key in seen:
                continue
            seen.add(key)
            out.append(rec)
    return out, raw_n, files
