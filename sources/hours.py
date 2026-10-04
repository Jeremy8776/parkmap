"""Parse Newham's zone hours text into structured hours, and name each zone.

Input examples (Controlled_Parking_Zones.TIMES):
  '9am - 6:30pm (Mon-Fri) 11am - 12 Noon (Sat)'   '8am - 6:30pm (Mon-Sun)'   '24 hrs (Mon-Sun)'   '10am - 2 pm (Mon-Fri)'
Output hours: [[days, start_min, end_min], ...] with days 1=Mon..7=Sun.
"""
import re

DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
INDUSTRIAL = {"ICH", "ICT", "IRW", "IRE", "IB"}


def _t(s):
    s = s.strip().lower().replace(" ", "")
    if s in ("12noon", "noon"):
        return 720
    m = re.match(r"(\d{1,2})(?::(\d{2}))?(am|pm)$", s)
    if not m:
        return None
    h, mi, ap = int(m.group(1)), int(m.group(2) or 0), m.group(3)
    h = h % 12 + (12 if ap == "pm" else 0)
    return h * 60 + mi


def _days(txt):
    t = txt.lower().replace(" ", "")
    m = re.match(r"([a-z]{3})(?:-([a-z]{3}))?$", t)
    if not m:
        return []
    a = DAYS.index(m.group(1)) + 1
    b = DAYS.index(m.group(2)) + 1 if m.group(2) else a
    return list(range(a, b + 1))


def parse_hours(times):
    t = (times or "").strip()
    if re.match(r"24\s*hrs", t, re.I):
        d = re.search(r"\(([^)]*)\)", t)
        return [[_days(d.group(1)) or [1, 2, 3, 4, 5, 6, 7], 0, 1440]]
    out = []
    for m in re.finditer(r"([\d:]+\s*(?:am|pm|noon)|12\s*noon)\s*-\s*([\d:]+\s*(?:am|pm|noon)|12\s*noon)\s*\(([^)]*)\)", t, re.I):
        s, e, d = _t(m.group(1)), _t(m.group(2)), _days(m.group(3))
        if s is not None and e is not None and d:
            out.append([d, s, e])
    return out


def zone_name(props):
    n, p, i = props["NAME"].strip(), (props.get("PREFIX") or "").strip(), props.get("Id")
    if p in INDUSTRIAL:
        return f"{n} industrial"
    if i == 34:
        return "Beckton extension"
    if i == 35:
        return "Upton Park (Mon to Fri)"
    return n


def describe(hours):
    """'Mon to Fri 10am to 2pm' style text from structured hours."""
    names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

    def clock(m):
        h, mi = divmod(m, 60)
        ap = "am" if h < 12 or h == 24 else "pm"
        return f"{(h % 12) or 12}{':%02d' % mi if mi else ''}{ap}"
    parts = []
    for days, s, e in hours:
        d = names[days[0] - 1] if len(days) == 1 else f"{names[days[0] - 1]} to {names[days[-1] - 1]}"
        parts.append(f"{d} all day" if (s, e) == (0, 1440) else f"{d} {clock(s)} to {clock(e)}")
    return ", ".join(parts)
