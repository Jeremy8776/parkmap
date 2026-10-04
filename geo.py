"""Small geometry helpers in a local metre grid (equirectangular, fine at this scale)."""
import math

LAT0 = 51.51
KX = 111320 * math.cos(math.radians(LAT0))
KY = 110574
def P(lat, lon):
    return (lon * KX, lat * KY)


# ---------- geometry helpers ----------
def rings_of(g):
    if g["type"] == "Polygon":
        return g["coordinates"]
    return [r for p in g["coordinates"] for r in p]


def pip(lon, lat, rings):
    inside = False
    for r in rings:
        j = len(r) - 1
        for i in range(len(r)):
            xi, yi = r[i][0], r[i][1]
            xj, yj = r[j][0], r[j][1]
            if (yi > lat) != (yj > lat) and lon < (xj - xi) * (lat - yi) / (yj - yi) + xi:
                inside = not inside
            j = i
    return inside


def ring_area(pts):
    a = 0
    for i in range(len(pts)):
        x1, y1 = pts[i]
        x2, y2 = pts[(i + 1) % len(pts)]
        a += x1 * y2 - x2 * y1
    return abs(a) / 2


def seg_dist(p, a, b):
    dx, dy = b[0] - a[0], b[1] - a[1]
    L = dx * dx + dy * dy
    t = 0 if L == 0 else max(0, min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L))
    return math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy)


def densify(pts, step):
    out = [pts[0]]
    for a, b in zip(pts, pts[1:]):
        L = math.hypot(b[0] - a[0], b[1] - a[1])
        n = max(1, int(L // step))
        for i in range(1, n + 1):
            out.append((a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n))
    return out




def clip_rect(ring, w, s, e, n):
    """Sutherland-Hodgman: clip a (lon, lat) ring to the rectangle w,s,e,n."""
    def edge(pts, inside, cross):
        out = []
        for i, cur in enumerate(pts):
            prev = pts[i - 1]
            if inside(cur):
                if not inside(prev):
                    out.append(cross(prev, cur))
                out.append(cur)
            elif inside(prev):
                out.append(cross(prev, cur))
        return out
    def x_at(a, b, x):
        t = (x - a[0]) / (b[0] - a[0]); return (x, a[1] + t * (b[1] - a[1]))
    def y_at(a, b, y):
        t = (y - a[1]) / (b[1] - a[1]); return (a[0] + t * (b[0] - a[0]), y)
    pts = list(ring)
    for inside, cross in ((lambda p: p[0] >= w, lambda a, b: x_at(a, b, w)), (lambda p: p[0] <= e, lambda a, b: x_at(a, b, e)),
                          (lambda p: p[1] >= s, lambda a, b: y_at(a, b, s)), (lambda p: p[1] <= n, lambda a, b: y_at(a, b, n))):
        if not pts:
            break
        pts = edge(pts, inside, cross)
    return pts
