#!/usr/bin/env python3
"""Cartoon / comic pop-up text overlay (transparent) for a 9:16 short-form video.

Renders every frame at 2x (2160x3840) with Pillow, downsamples with LANCZOS
(Pillow premultiplies alpha internally, so no halos), saves straight-alpha PNGs
and encodes ProRes 4444 / VP9 alpha / a preview composite with ffmpeg.

    python3 make_overlay.py            # everything
    python3 make_overlay.py --frames 0,3,60   # quick test render of a few frames
"""
import argparse
import math
import os
import random
import shutil
import subprocess

import numpy as np
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))

# =============================================================================
# CONFIG — everything you might want to tweak lives here
# =============================================================================
CONFIG = {
    # --- video -------------------------------------------------------------
    "W": 1080, "H": 1920, "FPS": 30, "FRAMES": 116,
    "SS": 2,                                   # supersampling factor
    "SOURCE_VIDEO": os.path.join(HERE, "1020_1.mp4"),
    "OUT_DIR": HERE,

    # --- font --------------------------------------------------------------
    # 1st choice Luckiest Guy; fallbacks Bangers / Lilita One (drop TTF in fonts/)
    "FONTS": [os.path.join(HERE, "fonts", f) for f in
              ("LuckiestGuy-Regular.ttf", "Bangers-Regular.ttf", "LilitaOne-Regular.ttf")],
    "FONT_SIZE_MAX": 150,                      # px @1x, shrunk automatically to fit
    "TEXT_MAX_W": 900,                         # px @1x, text block hard limit

    # --- text look ---------------------------------------------------------
    "TEXT_FILL": (255, 255, 255),
    "OUTLINE": (0, 0, 0),
    "OUTLINE_W": 16,                           # px @1x
    "SHADOW_OFFSET": (10, 10),                 # px @1x, hard (no blur) shadow
    "BURST_OUTLINE_W": 8,                      # px @1x
    "BURST_PAD": (40, 58),                     # px @1x, text box -> burst body
    "SPIKE_LEN": 52,                           # px @1x, average spike length
    "SPIKE_SIDE_FACTOR": 0.55,                 # spikes at the left/right ends are this short

    # --- placement / safe zone (each segment has its own "center") ----------
    "SAFE_TOP": 160, "SAFE_BOTTOM": 480, "SAFE_RIGHT": 140, "SAFE_LEFT": 0,
    "SAFE_PAD": 6,                             # extra breathing room inside safe zone

    # --- segments ----------------------------------------------------------
    "SEGMENTS": [
        {"text": "Indentations", "q": "?", "start": 0, "end": 59,
         "burst_color": "#FFD60A", "tilt": -6.0, "exit": True, "seed": 11,
         "spikes": 16, "max_bottom": 1000, "center": (540, 560)},
        {"text": "Crumbs", "q": "?", "start": 60, "end": 115,
         "burst_color": "#FF4D8D", "tilt": 6.0, "exit": False, "seed": 23,
         "spikes": 15, "max_bottom": 690,    # keep clear of the scratch (~y 700+)
         "center": (540, 515)},
    ],

    # --- animation (frames @30fps, relative to segment start) ---------------
    # uniform scale keys + squash/stretch keys (>1 = taller/narrower, <1 = flatter/wider)
    "POP_SCALE": [(0, 0.40), (3, 1.25), (5, 0.90), (7, 1.05), (9, 1.00)],
    "POP_STRETCH": [(0, 1.15), (3, 1.20), (5, 0.86), (7, 1.04), (9, 1.00)],
    "POP_ROT_FROM": -15.0,                     # deg, damped wobble into the tilt
    "BURST_LEAD": 2,                           # burst pops this many frames ahead
    "Q_DELAY": 3,                              # "?" pops this many frames late
    "Q_POP_SCALE": [(0, 0.0), (2, 1.40), (4, 0.82), (6, 1.10), (8, 1.00)],
    "Q_POP_STRETCH": [(0, 1.2), (2, 1.15), (4, 0.85), (6, 1.05), (8, 1.00)],
    "Q_WOBBLE_DEG": 12.0, "Q_WOBBLE_PERIOD": 18,
    "BOB_PX": 6, "BOB_PERIOD": 32,
    "BOIL_EVERY": 2,                           # redraw the wobbly lines every N frames
    "BOIL_PX": 2.5,                            # @1x jitter amount for line boil
    "SPEED_LINES": 10, "SPEED_LIFE": 7, "SPARKS": 6, "SPEED_LEN": 190,
    "EXIT_SCALE": [(-4, 1.0), (-3, 1.10), (-2, 0.70), (-1, 0.28), (0, 0.0)],  # rel. to seg end
    "EXIT_STRETCH": [(-4, 1.0), (-3, 1.10), (-2, 1.2), (-1, 1.3)],
    "PUFFS": 4,
}
# =============================================================================

C = CONFIG
SS = C["SS"]
W2, H2 = C["W"] * SS, C["H"] * SS


def hex2rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def load_font(size):
    for p in C["FONTS"]:
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    raise SystemExit("No font found — put LuckiestGuy-Regular.ttf in fonts/")


def keyed(keys, t):
    """Piecewise interpolation with ease-in-out between keys; clamps at the ends."""
    if t <= keys[0][0]:
        return keys[0][1]
    for (t0, v0), (t1, v1) in zip(keys, keys[1:]):
        if t <= t1:
            u = (t - t0) / (t1 - t0)
            u = u * u * (3 - 2 * u)
            return v0 + (v1 - v0) * u
    return keys[-1][1]


def safe_box():
    p = C["SAFE_PAD"]
    return (C["SAFE_LEFT"] + p, C["SAFE_TOP"] + p,
            C["W"] - C["SAFE_RIGHT"] - p, C["H"] - C["SAFE_BOTTOM"] - p)


def ray_to_box(cx, cy, ang, box):
    """Distance from (cx,cy) along angle to the box edge (1x coords)."""
    dx, dy = math.cos(ang), math.sin(ang)
    best = 1e9
    x0, y0, x1, y1 = box
    if dx > 1e-6: best = min(best, (x1 - cx) / dx)
    if dx < -1e-6: best = min(best, (x0 - cx) / dx)
    if dy > 1e-6: best = min(best, (y1 - cy) / dy)
    if dy < -1e-6: best = min(best, (y0 - cy) / dy)
    return best


def rot(pts, deg):
    a = math.radians(deg)
    c, s = math.cos(a), math.sin(a)
    x, y = pts[:, 0], pts[:, 1]
    return np.stack([x * c - y * s, x * s + y * c], axis=1)


# -----------------------------------------------------------------------------
# Layout (all numbers in 2x pixels from here on)
# -----------------------------------------------------------------------------
class Segment:
    def __init__(self, cfg, fit=1.0):
        self.cfg = cfg
        self.rng = random.Random(cfg["seed"])
        self.color = hex2rgb(cfg["burst_color"])
        size = int(C["FONT_SIZE_MAX"] * fit)
        while True:
            self.font = load_font(size * SS)
            full = cfg["text"] + cfg["q"]
            w = self.font.getlength(full) + 2 * C["OUTLINE_W"] * SS + C["SHADOW_OFFSET"][0] * SS
            if w <= C["TEXT_MAX_W"] * SS or size < 40:
                break
            size -= 2
        self.size = size
        f = self.font
        self.ow = C["OUTLINE_W"] * SS
        asc, desc = f.getmetrics()
        bb = f.getbbox(cfg["text"] + cfg["q"])
        self.cap_top, self.cap_bot = bb[1], bb[3]
        self.word_w = f.getlength(cfg["text"])
        self.q_w = f.getlength(cfg["q"])
        self.total_w = self.word_w + self.q_w + 6 * SS
        self.text_h = self.cap_bot - self.cap_top
        # static per-letter baseline jiggle -> hand-made feel
        self.letter_dy = [self.rng.uniform(-3, 3) * SS for _ in cfg["text"]]

        # burst geometry (unit spikes, irregular)
        n = cfg["spikes"]
        base = [i / n * 2 * math.pi for i in range(n)]
        self.spike_ang = [a + self.rng.uniform(-0.35, 0.35) * (2 * math.pi / n) for a in base]
        self.spike_len = [self.rng.uniform(0.55, 1.35) for _ in range(n)]
        self.valley_jit = [self.rng.uniform(0.9, 1.08) for _ in range(n)]
        self.rx_in = self.total_w / 2 + C["BURST_PAD"][0] * SS
        self.ry_in = self.text_h / 2 + C["BURST_PAD"][1] * SS
        self.spike_px = C["SPIKE_LEN"] * SS
        k = C["SPIKE_SIDE_FACTOR"]
        self.spike_len = [l * (k + (1 - k) * abs(math.sin(a)))
                          for l, a in zip(self.spike_len, self.spike_ang)]

        # speed lines + sparks (static random choices)
        self.lines = [(self.rng.uniform(0, 2 * math.pi), self.rng.uniform(0.7, 1.2),
                       self.rng.uniform(0.0, 1.2)) for _ in range(C["SPEED_LINES"])]
        self.sparks = [(self.rng.uniform(0, 2 * math.pi), self.rng.uniform(0.9, 1.3),
                        self.rng.uniform(0.7, 1.2), self.rng.choice([(255, 255, 255), self.color]))
                       for _ in range(C["SPARKS"])]
        self.puffs = [(i / C["PUFFS"] * 2 * math.pi + self.rng.uniform(-0.4, 0.4),
                       self.rng.uniform(0.8, 1.15)) for i in range(C["PUFFS"])]

    # ---- burst polygon, local coords (centered at 0,0), boil-jittered -------
    def burst_poly(self, boil_seed, scale_len=1.0):
        r = random.Random(self.cfg["seed"] * 1000 + boil_seed)
        bj = C["BOIL_PX"] * SS
        pts = []
        n = len(self.spike_ang)
        for i in range(n):
            a = self.spike_ang[i]
            a_next = self.spike_ang[(i + 1) % n] + (2 * math.pi if i == n - 1 else 0)
            # spike tip (radial outward from the inner ellipse)
            ex, ey = self.rx_in * math.cos(a), self.ry_in * math.sin(a)
            L = self.spike_px * self.spike_len[i] * scale_len * r.uniform(0.94, 1.06)
            pts.append((ex + L * math.cos(a) + r.uniform(-bj, bj),
                        ey + L * math.sin(a) + r.uniform(-bj, bj)))
            # valley between spikes, slightly inside the ellipse
            am = (a + a_next) / 2
            v = self.valley_jit[i] * 0.93
            pts.append((self.rx_in * v * math.cos(am) + r.uniform(-bj, bj),
                        self.ry_in * v * math.sin(am) + r.uniform(-bj, bj)))
        return np.array(pts)

    # ---- text layer (word + "?" composited), centered layer -----------------
    def text_layer(self, boil_seed, q_scale, q_stretch, q_rot):
        r = random.Random(self.cfg["seed"] * 7777 + boil_seed)
        ow = self.ow
        sh = (C["SHADOW_OFFSET"][0] * SS, C["SHADOW_OFFSET"][1] * SS)
        pad = ow + 90 * SS
        lw = int(self.total_w + 2 * pad)
        lh = int(self.text_h + 2 * pad)
        layer = Image.new("RGBA", (lw, lh), (0, 0, 0, 0))
        d = ImageDraw.Draw(layer)
        x0 = pad
        y0 = pad - self.cap_top
        bj = C["BOIL_PX"] * SS
        f = self.font
        txt = self.cfg["text"]
        pos = []
        for i, ch in enumerate(txt):
            x = x0 + f.getlength(txt[:i]) + r.uniform(-bj, bj)
            y = y0 + self.letter_dy[i] + r.uniform(-bj, bj)
            sw = max(1, int(round(ow + r.uniform(-1.5, 1.5) * SS)))
            pos.append((x, y, ch, sw))
        # pass 1: hard shadow, pass 2: black outline, pass 3: white fill
        for x, y, ch, sw in pos:
            d.text((x + sh[0], y + sh[1]), ch, font=f, fill=C["OUTLINE"],
                   stroke_width=sw, stroke_fill=C["OUTLINE"])
        for x, y, ch, sw in pos:
            d.text((x, y), ch, font=f, fill=C["OUTLINE"], stroke_width=sw, stroke_fill=C["OUTLINE"])
        for x, y, ch, sw in pos:
            d.text((x, y), ch, font=f, fill=C["TEXT_FILL"])

        # "?" as its own element: own pop + wobble, pivot at its base
        if q_scale > 0.01:
            qpad = ow + 20 * SS
            qw = int(self.q_w + 2 * qpad + sh[0])
            qh = int(self.text_h + 2 * qpad + sh[1])
            q = Image.new("RGBA", (qw, qh), (0, 0, 0, 0))
            qd = ImageDraw.Draw(q)
            qx, qy = qpad, qpad - self.cap_top
            sw = max(1, int(round(ow + r.uniform(-1.5, 1.5) * SS)))
            qd.text((qx + sh[0], qy + sh[1]), self.cfg["q"], font=f, fill=C["OUTLINE"],
                    stroke_width=sw, stroke_fill=C["OUTLINE"])
            qd.text((qx, qy), self.cfg["q"], font=f, fill=C["TEXT_FILL"],
                    stroke_width=sw, stroke_fill=C["OUTLINE"])
            sx, sy = q_scale / q_stretch, q_scale * q_stretch
            nw, nh = max(1, int(qw * sx)), max(1, int(qh * sy))
            q = q.resize((nw, nh), Image.LANCZOS)
            # pivot = bottom centre of the glyph box
            piv = (nw / 2, (qpad + self.text_h) * sy)
            big = Image.new("RGBA", (nw * 3, nh * 3), (0, 0, 0, 0))
            big.paste(q, (nw, nh))
            big = big.rotate(-q_rot, resample=Image.BICUBIC, center=(nw + piv[0], nh + piv[1]))
            # place: glyph base sits where it would in the word
            tx = x0 + self.word_w + 6 * SS + self.q_w / 2
            ty = pad + self.text_h
            layer.alpha_composite(big, (int(tx - (nw + piv[0])), int(ty - (nh + piv[1]))))
        return layer


# -----------------------------------------------------------------------------
# Per-frame state
# -----------------------------------------------------------------------------
def group_state(seg, t):
    """Group transform at local frame t (t may be negative for the burst lead)."""
    tilt = seg.cfg["tilt"]
    s = keyed(C["POP_SCALE"], t)
    st = keyed(C["POP_STRETCH"], t)
    A = C["POP_ROT_FROM"] - tilt
    tt = max(t, 0)
    ang = tilt + A * math.cos(math.pi * tt / 4.0) * math.exp(-tt / 3.5)
    ramp = min(1.0, max(0.0, (t - 6) / 8))
    bob = C["BOB_PX"] * SS * math.sin(2 * math.pi * (t - 6) / C["BOB_PERIOD"]) * ramp
    if seg.cfg["exit"]:
        te = t - (seg.cfg["end"] - seg.cfg["start"])
        s *= keyed(C["EXIT_SCALE"], te)
        st *= keyed(C["EXIT_STRETCH"], te)
    return s, st, ang, bob


def fit_extents(seg):
    """Worst-case extents (1x px, relative to centre) of burst over all frames."""
    n = seg.cfg["end"] - seg.cfg["start"] + 1
    right = left = up = down = down_rest = 0.0
    for t in range(n):
        s, st, ang, bob = group_state(seg, t + C["BURST_LEAD"])
        poly = seg.burst_poly(t // C["BOIL_EVERY"])
        poly[:, 0] *= s / st
        poly[:, 1] *= s * st
        poly = rot(poly, ang)
        poly[:, 1] += bob
        poly /= SS
        right = max(right, poly[:, 0].max()); left = max(left, -poly[:, 0].min())
        up = max(up, -poly[:, 1].min()); down = max(down, poly[:, 1].max())
        if t >= 10:
            down_rest = max(down_rest, poly[:, 1].max())
    return right, left, up, down, down_rest


def build_segment(cfg):
    cx, cy = cfg["center"]
    x0, y0, x1, y1 = safe_box()
    fit = 1.0
    for _ in range(12):
        seg = Segment(cfg, fit)
        r, l, u, d, dr = fit_extents(seg)
        need = max(r / (x1 - cx), l / (cx - x0), u / (cy - y0), d / (y1 - cy),
                   dr / (cfg["max_bottom"] - cy))
        if need <= 1.0:
            return seg
        fit *= min(0.985, 1.0 / need ** 0.9)
    return seg


# -----------------------------------------------------------------------------
# Drawing helpers
# -----------------------------------------------------------------------------
def draw_outlined_poly(d, pts, fill, ow):
    pts = [tuple(p) for p in pts]
    d.polygon(pts, fill=fill)
    d.line(pts + [pts[0], pts[1]], fill=C["OUTLINE"], width=ow, joint="curve")


def star_pts(cx, cy, r_out, r_in, n=4, rot_deg=0.0):
    pts = []
    for i in range(n * 2):
        a = math.radians(rot_deg) + i * math.pi / n
        rr = r_out if i % 2 == 0 else r_in
        pts.append((cx + rr * math.cos(a), cy + rr * math.sin(a)))
    return pts


def draw_effects(d, seg, tb, center2):
    """Speed lines + sparks around a burst that popped at burst-time tb=0."""
    life = C["SPEED_LIFE"]
    if not (0 <= tb <= life):
        return
    p = tb / life
    box = safe_box()
    cx1, cy1 = center2[0] / SS, center2[1] / SS
    base_r = max(seg.rx_in, seg.ry_in) / SS
    ow = 5 * SS
    for ang, ln, delay in seg.lines:
        q = (tb - delay) / (life - delay)
        if not (0 < q <= 1):
            continue
        # direction on an ellipse so lines leave from the burst edge
        ex = (seg.rx_in + seg.spike_px * 0.6) / SS * math.cos(ang)
        ey = (seg.ry_in + seg.spike_px * 0.6) / SS * math.sin(ang)
        r0 = math.hypot(ex, ey)
        rmax = min(ray_to_box(cx1, cy1, ang, box) - 8, r0 + C["SPEED_LEN"] * ln)
        if rmax <= r0 + 20:
            continue
        span = rmax - r0
        head = r0 + span * min(1, (1 - (1 - q) ** 2) * ln)
        tail = r0 + span * max(0, q ** 1.6 * 1.05 - 0.05) * ln
        head, tail = min(head, rmax), min(tail, rmax)
        if head - tail < 6:
            continue
        wid = 9 * (1 - q * 0.6)
        c, s = math.cos(ang), math.sin(ang)
        nx, ny = -s, c
        hx, hy = cx1 + c * head, cy1 + s * head
        tx, ty = cx1 + c * tail, cy1 + s * tail
        pts = [(tx + nx * wid, ty + ny * wid), (hx, hy), (tx - nx * wid, ty - ny * wid)]
        pts = [(x * SS, y * SS) for x, y in pts]
        draw_outlined_poly(d, pts, (255, 255, 255), ow)
    for ang, rr, sz, col in seg.sparks:
        q = tb / (life - 1)
        if q > 1:
            continue
        r_burst = math.hypot((seg.rx_in + seg.spike_px) / SS * math.cos(ang),
                             (seg.ry_in + seg.spike_px) / SS * math.sin(ang))
        dist = r_burst * (0.95 + 0.25 * q * rr)
        size = 26 * sz * math.sin(math.pi * min(1, q * 1.15 + 0.1))
        if size < 3:
            continue
        rmax = ray_to_box(cx1, cy1, ang, box)
        dist = min(dist, rmax - size - 4)
        px, py = cx1 + math.cos(ang) * dist, cy1 + math.sin(ang) * dist
        pts = star_pts(px * SS, py * SS, size * SS, size * 0.38 * SS, 4, 45 * q + ang * 30)
        draw_outlined_poly(d, pts, col, 4 * SS)


def draw_puffs(d, seg, te, center2, extent):
    """Smoke puffs during the exit; te = frames since exit pop (0..)."""
    if te < 0:
        return
    box = safe_box()
    for i, (ang, k) in enumerate(seg.puffs):
        q = te / 3.0
        grow = math.sin(math.pi * min(1, 0.25 + q * 0.6)) * k
        if grow <= 0.05:
            continue
        dist = (extent * 0.55 + 40 * SS * q) / SS
        rmax = ray_to_box(center2[0] / SS, center2[1] / SS, ang, box)
        rad = 48 * grow
        dist = min(dist, rmax - rad * 1.6)
        px = center2[0] / SS + math.cos(ang) * dist
        py = center2[1] / SS + math.sin(ang) * dist
        blobs = [(0, 0, 1.0), (-0.75, 0.25, 0.7), (0.75, 0.2, 0.75), (0.1, -0.55, 0.65)]
        # outline pass then fill pass so the cluster reads as one cloud
        for pass_ in (0, 1):
            for bx, by, br in blobs:
                R = rad * br * SS + (4 * SS if pass_ == 0 else 0)
                X, Y = (px + bx * rad) * SS, (py + by * rad) * SS
                d.ellipse((X - R, Y - R, X + R, Y + R),
                          fill=C["OUTLINE"] if pass_ == 0 else (236, 236, 236))


# -----------------------------------------------------------------------------
def render_frame(segs, f):
    canvas = Image.new("RGBA", (W2, H2), (0, 0, 0, 0))
    seg = next((s for s in segs if s.cfg["start"] <= f <= s.cfg["end"]), None)
    if seg is None:
        return canvas.resize((C["W"], C["H"]), Image.LANCZOS)
    t = f - seg.cfg["start"]
    boil = f // C["BOIL_EVERY"]
    cx, cy = seg.cfg["center"][0] * SS, seg.cfg["center"][1] * SS
    d = ImageDraw.Draw(canvas)

    # ---- burst (leads the text) + its speed lines/sparks ----
    tb = t + C["BURST_LEAD"]
    bs, bst, bang, bbob = group_state(seg, tb)
    center2 = (cx, cy + bbob)
    draw_effects(d, seg, tb, center2)
    if bs > 0.01:
        poly = seg.burst_poly(boil)
        poly[:, 0] *= bs / bst
        poly[:, 1] *= bs * bst
        poly = rot(poly, bang)
        poly[:, 0] += center2[0]
        poly[:, 1] += center2[1]
        draw_outlined_poly(d, poly, seg.color, C["BURST_OUTLINE_W"] * SS)

    # ---- exit puffs ----
    if seg.cfg["exit"]:
        te = t - (seg.cfg["end"] - seg.cfg["start"] - 2)
        draw_puffs(d, seg, te, center2, seg.rx_in)

    # ---- text group ----
    s, st, ang, bob = group_state(seg, t)
    if s > 0.01:
        tq = t - C["Q_DELAY"]
        if tq >= 0:
            qs = keyed(C["Q_POP_SCALE"], tq)
            qst = keyed(C["Q_POP_STRETCH"], tq)
            ramp = min(1.0, tq / 6)
            qr = -C["Q_WOBBLE_DEG"] * math.sin(2 * math.pi * (tq - 3) / C["Q_WOBBLE_PERIOD"]) * ramp
            qr += 18 * max(0, 1 - tq / 4)  # pops in tipped over
        else:
            qs, qst, qr = 0, 1, 0
        layer = seg.text_layer(boil, qs, qst, qr)
        lw, lh = layer.size
        nw, nh = max(1, int(lw * s / st)), max(1, int(lh * s * st))
        layer = layer.resize((nw, nh), Image.LANCZOS)
        layer = layer.rotate(-ang, resample=Image.BICUBIC, expand=True)
        canvas.alpha_composite(layer, (int(cx - layer.width / 2), int(cy + bob - layer.height / 2)))

    out = canvas.resize((C["W"], C["H"]), Image.LANCZOS)
    # hard guard: nothing may live inside the platform UI zones
    a = np.array(out)
    a[:C["SAFE_TOP"], :, 3] = 0
    a[C["H"] - C["SAFE_BOTTOM"]:, :, 3] = 0
    a[:, C["W"] - C["SAFE_RIGHT"]:, 3] = 0
    a[a[:, :, 3] == 0, :3] = 0
    return Image.fromarray(a, "RGBA")


def run(cmd):
    print("+", " ".join(cmd))
    subprocess.run(cmd, check=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--frames", help="comma list of frames to render only (test mode)")
    args = ap.parse_args()

    segs = [build_segment(s) for s in C["SEGMENTS"]]
    for s in segs:
        print(f"{s.cfg['text']}{s.cfg['q']}: font {s.size}px, text block "
              f"{(s.total_w + 2 * s.ow) / SS:.0f}px wide")

    out = C["OUT_DIR"]
    seq = os.path.join(out, "png_seq")
    if args.frames:
        os.makedirs(os.path.join(out, "test"), exist_ok=True)
        for f in map(int, args.frames.split(",")):
            render_frame(segs, f).save(os.path.join(out, "test", f"frame_{f:04d}.png"))
        return

    shutil.rmtree(seq, ignore_errors=True)
    os.makedirs(seq)
    for f in range(C["FRAMES"]):
        render_frame(segs, f).save(os.path.join(seq, f"frame_{f:04d}.png"), optimize=False)
        if f % 10 == 0:
            print("frame", f)

    pat = os.path.join(seq, "frame_%04d.png")
    fps = str(C["FPS"])
    run(["ffmpeg", "-v", "error", "-y", "-framerate", fps, "-i", pat,
         "-c:v", "prores_ks", "-profile:v", "4444", "-pix_fmt", "yuva444p10le",
         "-alpha_bits", "16", "-vendor", "apl0",
         os.path.join(out, "overlay_prores4444.mov")])
    run(["ffmpeg", "-v", "error", "-y", "-framerate", fps, "-i", pat,
         "-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", "-b:v", "0", "-crf", "18",
         "-row-mt", "1", "-auto-alt-ref", "0",
         os.path.join(out, "overlay_vp9.webm")])
    if os.path.exists(C["SOURCE_VIDEO"]):
        run(["ffmpeg", "-v", "error", "-y", "-i", C["SOURCE_VIDEO"],
             "-framerate", fps, "-i", pat,
             "-filter_complex", "[0:v][1:v]overlay=0:0:format=auto:shortest=1,format=yuv420p[v]",
             "-map", "[v]", "-map", "0:a?", "-c:v", "libx264", "-crf", "16",
             "-preset", "medium", "-c:a", "copy", "-frames:v", str(C["FRAMES"]),
             os.path.join(out, "preview.mp4")])


if __name__ == "__main__":
    main()
