#!/usr/bin/env python3
"""Cartoon / comic pop-up text overlay (transparent) for a 16:9 video.

Renders every frame at 2x (3840x2160) with Pillow, downsamples with LANCZOS
(Pillow premultiplies alpha internally, so no halos), saves straight-alpha PNGs
and encodes ProRes 4444 / VP9 alpha / a preview composite with ffmpeg.

    python3 make_overlay.py            # everything
    python3 make_overlay.py --frames 0,3,60   # quick test render of a few frames
    python3 make_overlay.py --source other.mp4   # composite preview.mp4 over another video
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
    "W": 1920, "H": 1080, "FPS": 30, "FRAMES": 116,
    "SS": 2,                                   # supersampling factor
    "SOURCE_VIDEO": os.path.join(HERE, "1020_11.mp4"),
    "OUT_DIR": HERE,

    # --- font --------------------------------------------------------------
    # 1st choice Luckiest Guy; fallbacks Bangers / Lilita One (drop TTF in fonts/)
    "FONTS": [os.path.join(HERE, "fonts", f) for f in
              ("LuckiestGuy-Regular.ttf", "Bangers-Regular.ttf", "LilitaOne-Regular.ttf")],
    "FONT_SIZE_MAX": 150,                      # px @1x, shrunk automatically to fit
    "TEXT_MAX_W": 1400,                        # px @1x, text block hard limit

    # --- text look ---------------------------------------------------------
    "TEXT_FILL": (255, 255, 255),
    "OUTLINE": (0, 0, 0),
    "OUTLINE_W": 16,                           # px @1x
    "SHADOW_OFFSET": (10, 10),                 # px @1x, hard (no blur) shadow
    "ACCENT_STROKE_W": 6,                      # px @1x, coloured ring outside the black outline (0 = off)

    # --- placement / title safe 5% (each segment has its own "center") ------
    "SAFE_X": 96, "SAFE_Y": 54,
    "SAFE_PAD": 6,                             # extra breathing room inside safe zone

    # --- segments ----------------------------------------------------------
    "SEGMENTS": [
        # max_bottom: lowest y the text may reach in any frame (pop, bob, shadow included)
        # fx_bottom:  lowest y the speed lines / sparks / puffs may reach
        {"text": "Indentations", "q": "?", "start": 0, "end": 59,
         "accent": "#FFD60A", "tilt": -6.0, "exit": True, "seed": 11,
         "center": (960, 190), "max_bottom": 330,    # keep the dents (centre-bottom) clear
         "fx_bottom": 420},
        {"text": "Crumbs", "q": "?", "start": 60, "end": 115,
         "accent": "#FF4D8D", "tilt": 6.0, "exit": False, "seed": 23,
         "center": (960, 190), "max_bottom": 290,    # scratch at y 300-420, crumbs below 640
         "fx_bottom": 295},
    ],

    # --- animation (frames @30fps, relative to segment start) ---------------
    # uniform scale keys + squash/stretch keys (>1 = taller/narrower, <1 = flatter/wider)
    "POP_SCALE": [(0, 0.40), (3, 1.25), (5, 0.90), (7, 1.05), (9, 1.00)],
    "POP_STRETCH": [(0, 1.15), (3, 1.20), (5, 0.86), (7, 1.04), (9, 1.00)],
    "POP_ROT_FROM": -15.0,                     # deg, damped wobble into the tilt
    "FX_AT": 3,                                # speed lines/sparks fire at the overshoot peak
    "Q_DELAY": 3,                              # "?" pops this many frames late
    "Q_POP_SCALE": [(0, 0.0), (2, 1.40), (4, 0.82), (6, 1.10), (8, 1.00)],
    "Q_POP_STRETCH": [(0, 1.2), (2, 1.15), (4, 0.85), (6, 1.05), (8, 1.00)],
    "Q_WOBBLE_DEG": 12.0, "Q_WOBBLE_PERIOD": 18,
    "BOB_PX": 6, "BOB_PERIOD": 32,
    "BOIL_EVERY": 2,                           # redraw the wobbly lines every N frames
    "BOIL_PX": 2.5,                            # @1x jitter amount for line boil
    "EFFECTS": True,                           # speed lines + sparks + exit puffs on/off
    "FX_PAD": 30,                              # px @1x, text box -> effects ellipse
    "SPEED_LINES": 10, "SPEED_LIFE": 7, "SPARKS": 6, "SPEED_LEN": 260,
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


def safe_box(bottom=None):
    p = C["SAFE_PAD"]
    y1 = C["H"] - C["SAFE_Y"] - p
    return (C["SAFE_X"] + p, C["SAFE_Y"] + p, C["W"] - C["SAFE_X"] - p,
            y1 if bottom is None else min(y1, bottom))


def clamp_to_box(x, y, m, box):
    """Keep a shape of radius m centred at (x, y) fully inside the box (1x coords)."""
    return (min(max(x, box[0] + m), box[2] - m), min(max(y, box[1] + m), box[3] - m))


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


# -----------------------------------------------------------------------------
# Layout (all numbers in 2x pixels from here on)
# -----------------------------------------------------------------------------
class Segment:
    def __init__(self, cfg, fit=1.0):
        self.cfg = cfg
        self.rng = random.Random(cfg["seed"])
        self.color = hex2rgb(cfg["accent"])
        size = int(C["FONT_SIZE_MAX"] * fit)
        while True:
            self.font = load_font(size * SS)
            full = cfg["text"] + cfg["q"]
            w = (self.font.getlength(full) + 2 * (C["OUTLINE_W"] + C["ACCENT_STROKE_W"]) * SS
                 + C["SHADOW_OFFSET"][0] * SS)
            if w <= C["TEXT_MAX_W"] * SS or size < 40:
                break
            size -= 2
        self.size = size
        f = self.font
        self.ow = C["OUTLINE_W"] * SS
        self.aw = C["ACCENT_STROKE_W"] * SS
        bb = f.getbbox(cfg["text"] + cfg["q"])
        self.cap_top, self.cap_bot = bb[1], bb[3]
        self.word_w = f.getlength(cfg["text"])
        self.q_w = f.getlength(cfg["q"])
        self.total_w = self.word_w + self.q_w + 6 * SS
        self.text_h = self.cap_bot - self.cap_top
        # static per-letter baseline jiggle -> hand-made feel
        self.letter_dy = [self.rng.uniform(-3, 3) * SS for _ in cfg["text"]]
        # half-size of the outlined text box (2x px)
        self.half_w = self.total_w / 2 + self.ow + self.aw
        self.half_h = self.text_h / 2 + self.ow + self.aw

        # speed lines + sparks (static random choices). The text is wide and sits in a
        # short band, so they fan out sideways (into the margins), alternating L/R.
        def side_ang(i, spread):
            return (math.pi if i % 2 else 0.0) + math.radians(self.rng.uniform(-spread, spread))
        self.lines = [(side_ang(i, 32), self.rng.uniform(0.7, 1.2),
                       self.rng.uniform(0.0, 1.2)) for i in range(C["SPEED_LINES"])]
        self.sparks = [(side_ang(i, 55), self.rng.uniform(0.9, 1.3),
                        self.rng.uniform(0.7, 1.2), self.rng.choice([(255, 255, 255), self.color]))
                       for i in range(C["SPARKS"])]
        self.puffs = [(i / C["PUFFS"] * 2 * math.pi + self.rng.uniform(-0.4, 0.4),
                       self.rng.uniform(0.8, 1.15)) for i in range(C["PUFFS"])]

    # ---- text layer (word + "?" composited), centered layer -----------------
    def text_layer(self, boil_seed, q_scale, q_stretch, q_rot):
        r = random.Random(self.cfg["seed"] * 7777 + boil_seed)
        ow = self.ow
        sh = (C["SHADOW_OFFSET"][0] * SS, C["SHADOW_OFFSET"][1] * SS)
        aw = self.aw
        pad = ow + aw + 90 * SS
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
        # pass 1: hard shadow, 2: accent ring, 3: black outline, 4: white fill
        for x, y, ch, sw in pos:
            d.text((x + sh[0], y + sh[1]), ch, font=f, fill=C["OUTLINE"],
                   stroke_width=sw + aw, stroke_fill=C["OUTLINE"])
        if aw:
            for x, y, ch, sw in pos:
                d.text((x, y), ch, font=f, fill=self.color, stroke_width=sw + aw,
                       stroke_fill=self.color)
        for x, y, ch, sw in pos:
            d.text((x, y), ch, font=f, fill=C["OUTLINE"], stroke_width=sw, stroke_fill=C["OUTLINE"])
        for x, y, ch, sw in pos:
            d.text((x, y), ch, font=f, fill=C["TEXT_FILL"])

        # "?" as its own element: own pop + wobble, pivot at its base
        if q_scale > 0.01:
            qpad = ow + aw + 20 * SS
            qw = int(self.q_w + 2 * qpad + sh[0])
            qh = int(self.text_h + 2 * qpad + sh[1])
            q = Image.new("RGBA", (qw, qh), (0, 0, 0, 0))
            qd = ImageDraw.Draw(q)
            qx, qy = qpad, qpad - self.cap_top
            sw = max(1, int(round(ow + r.uniform(-1.5, 1.5) * SS)))
            qd.text((qx + sh[0], qy + sh[1]), self.cfg["q"], font=f, fill=C["OUTLINE"],
                    stroke_width=sw + aw, stroke_fill=C["OUTLINE"])
            if aw:
                qd.text((qx, qy), self.cfg["q"], font=f, fill=self.color,
                        stroke_width=sw + aw, stroke_fill=self.color)
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
    """Group transform at local frame t."""
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


def q_state(t):
    """Scale, stretch and rotation of the separate "?" at local frame t."""
    tq = t - C["Q_DELAY"]
    if tq < 0:
        return 0, 1, 0
    qs = keyed(C["Q_POP_SCALE"], tq)
    qst = keyed(C["Q_POP_STRETCH"], tq)
    ramp = min(1.0, tq / 6)
    qr = -C["Q_WOBBLE_DEG"] * math.sin(2 * math.pi * (tq - 3) / C["Q_WOBBLE_PERIOD"]) * ramp
    qr += 18 * max(0, 1 - tq / 4)  # pops in tipped over
    return qs, qst, qr


def group_image(seg, t, boil):
    """Transformed text group for local frame t -> (layer, (x, y) @2x) or None."""
    s, st, ang, bob = group_state(seg, t)
    if s <= 0.01:
        return None
    layer = seg.text_layer(boil, *q_state(t))
    lw, lh = layer.size
    nw, nh = max(1, int(lw * s / st)), max(1, int(lh * s * st))
    layer = layer.resize((nw, nh), Image.LANCZOS)
    layer = layer.rotate(-ang, resample=Image.BICUBIC, expand=True)
    cx, cy = seg.cfg["center"][0] * SS, seg.cfg["center"][1] * SS
    return layer, (int(cx - layer.width / 2), int(cy + bob - layer.height / 2))


def fit_extents(seg):
    """Worst-case drawn extents (1x px, absolute) of the text group over all frames:
    the real alpha of the transformed layer, so outline, accent, shadow, the "?" and
    every pop overshoot are included."""
    x0 = y0 = 1e9
    x1 = y1 = -1e9
    n = seg.cfg["end"] - seg.cfg["start"] + 1
    # every pop/exit frame, every 3rd hold frame (bob + "?" wobble are slow)
    frames = sorted(set(range(0, 14)) | set(range(14, n, 3)) | set(range(n - 6, n)))
    for t in frames:
        g = group_image(seg, t, (seg.cfg["start"] + t) // C["BOIL_EVERY"])
        if g is None:
            continue
        layer, (px, py) = g
        bb = layer.getchannel("A").point(lambda v: 255 if v > 8 else 0).getbbox()
        if bb is None:
            continue
        x0 = min(x0, (px + bb[0]) / SS); y0 = min(y0, (py + bb[1]) / SS)
        x1 = max(x1, (px + bb[2]) / SS); y1 = max(y1, (py + bb[3]) / SS)
    b = C["BOIL_PX"]  # boil jitter between sampled frames
    return x0 - b, y0 - b, x1 + b, y1 + b


def build_segment(cfg):
    """Largest font that keeps every frame inside the allowed box. The centre's y is
    re-balanced inside the band (y≈ the configured value) so the pop overshoot has
    equal room up and down."""
    cfg = dict(cfg)
    cx, cy = cfg["center"]
    bx0, by0, bx1, by1 = safe_box(cfg["max_bottom"])
    fit, best = 1.0, None
    for _ in range(8):
        seg = Segment(cfg, fit)                  # seg.cfg is cfg: centre updates apply
        x0, y0, x1, y1 = fit_extents(seg)
        cy += ((by0 + by1) - (y0 + y1)) / 2      # centre the extents vertically
        cfg["center"] = (cx, round(cy))
        need = max((x1 - cx) / (bx1 - cx), (cx - x0) / (cx - bx0),
                   (y1 - y0) / (by1 - by0))
        if need <= 1.0:
            best = (seg.size, dict(cfg), fit)
            if need >= 0.97 or fit >= 1.0:
                break
        fit = min(1.0, fit / need * (0.995 if need > 1 else 1.0))
    if best is None:
        raise SystemExit(f"could not fit {cfg['text']}")
    seg = Segment(best[1], best[2])
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


def fx_ellipse(seg, t):
    """Semi-axes (1x px) of the ellipse wrapping the current text box + FX_PAD."""
    s, st, _, _ = group_state(seg, t)
    a = seg.half_w / SS * s / st
    b = seg.half_h / SS * s * st
    k = 1.15  # ellipse through the box corners, 15% wider than the box
    return a * k + C["FX_PAD"], b / math.sqrt(1 - 1 / k ** 2) + C["FX_PAD"]


def draw_effects(d, seg, te, center2, t):
    """Speed lines + sparks fired at effect-time te=0 (the text's overshoot peak)."""
    life = C["SPEED_LIFE"]
    if not (0 <= te <= life):
        return
    box = safe_box(seg.cfg["fx_bottom"])
    cx1, cy1 = center2[0] / SS, center2[1] / SS
    rx, ry = fx_ellipse(seg, t)
    ow = 5 * SS
    for ang, ln, delay in seg.lines:
        q = (te - delay) / (life - delay)
        if not (0 < q <= 1):
            continue
        r0 = math.hypot(rx * math.cos(ang), ry * math.sin(ang))
        rmax = min(ray_to_box(cx1, cy1, ang, box) - 8, r0 + C["SPEED_LEN"] * ln)
        if rmax <= r0 + 20:
            continue
        span = rmax - r0
        head = r0 + span * min(1, (1 - (1 - q) ** 2) * ln)
        tail = r0 + span * max(0, q ** 1.6 * 1.05 - 0.05) * ln
        head, tail = min(head, rmax), min(tail, rmax)
        if head - tail < 6:
            continue
        wid = 12 * (1 - q * 0.6)
        c, s = math.cos(ang), math.sin(ang)
        nx, ny = -s, c
        hx, hy = cx1 + c * head, cy1 + s * head
        tx, ty = cx1 + c * tail, cy1 + s * tail
        pts = [(tx + nx * wid, ty + ny * wid), (hx, hy), (tx - nx * wid, ty - ny * wid)]
        pts = [(x * SS, y * SS) for x, y in pts]
        draw_outlined_poly(d, pts, (255, 255, 255), ow)
    for ang, rr, sz, col in seg.sparks:
        q = te / (life - 1)
        if q > 1:
            continue
        r_edge = math.hypot(rx * math.cos(ang), ry * math.sin(ang))
        dist = r_edge * (0.95 + 0.25 * q * rr)
        size = 26 * sz * math.sin(math.pi * min(1, q * 1.15 + 0.1))
        if size < 3:
            continue
        dist = min(dist, ray_to_box(cx1, cy1, ang, box) - size - 4)
        if dist < r_edge * 0.85:  # no room outside the text in this direction
            continue
        px, py = clamp_to_box(cx1 + math.cos(ang) * dist, cy1 + math.sin(ang) * dist,
                              size + 5, box)
        pts = star_pts(px * SS, py * SS, size * SS, size * 0.38 * SS, 4, 45 * q + ang * 30)
        draw_outlined_poly(d, pts, col, 4 * SS)


def draw_puffs(d, seg, te, center2, t):
    """Smoke puffs during the exit; te = frames since exit pop (0..)."""
    if te < 0:
        return
    box = safe_box(seg.cfg["fx_bottom"])
    rx, ry = fx_ellipse(seg, t - te)  # text size just before it collapses
    for i, (ang, k) in enumerate(seg.puffs):
        q = te / 3.0
        grow = math.sin(math.pi * min(1, 0.25 + q * 0.6)) * k
        if grow <= 0.05:
            continue
        rad = 48 * grow
        f = 0.45 + 0.15 * q
        dist = math.hypot(rx * f * math.cos(ang), ry * f * math.sin(ang))
        dist = min(dist, ray_to_box(center2[0] / SS, center2[1] / SS, ang, box) - rad * 1.6)
        px, py = clamp_to_box(center2[0] / SS + math.cos(ang) * dist,
                              center2[1] / SS + math.sin(ang) * dist, rad * 1.8 + 5, box)
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

    _, _, _, bob = group_state(seg, t)
    center2 = (cx, cy + bob)

    # ---- effects (behind the text) ----
    if C["EFFECTS"]:
        draw_effects(d, seg, t - C["FX_AT"], center2, t)
        if seg.cfg["exit"]:
            draw_puffs(d, seg, t - (seg.cfg["end"] - seg.cfg["start"] - 2), center2, t)

    # ---- text group ----
    g = group_image(seg, t, boil)
    if g is not None:
        canvas.alpha_composite(g[0], g[1])

    out = canvas.resize((C["W"], C["H"]), Image.LANCZOS)
    # hard guard: nothing may live outside the 5% title safe area
    a = np.array(out)
    a[:C["SAFE_Y"], :, 3] = 0
    a[C["H"] - C["SAFE_Y"]:, :, 3] = 0
    a[:, :C["SAFE_X"], 3] = 0
    a[:, C["W"] - C["SAFE_X"]:, 3] = 0
    a[a[:, :, 3] == 0, :3] = 0
    return Image.fromarray(a, "RGBA")


def run(cmd):
    print("+", " ".join(cmd))
    subprocess.run(cmd, check=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--frames", help="comma list of frames to render only (test mode)")
    ap.add_argument("--source", default=C["SOURCE_VIDEO"], help="video under preview.mp4")
    args = ap.parse_args()

    segs = [build_segment(s) for s in C["SEGMENTS"]]
    for s in segs:
        print(f"{s.cfg['text']}{s.cfg['q']}: font {s.size}px, text block "
              f"{2 * s.half_w / SS:.0f}px wide, centre {s.cfg['center']}")

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
    if not os.path.exists(args.source):
        print(f"!! {args.source} not found — preview.mp4 skipped")
    else:
        run(["ffmpeg", "-v", "error", "-y", "-i", args.source,
             "-framerate", fps, "-i", pat,
             "-filter_complex", "[0:v][1:v]overlay=0:0:format=auto:shortest=1,format=yuv420p[v]",
             "-map", "[v]", "-map", "0:a?", "-c:v", "libx264", "-crf", "16",
             "-preset", "medium", "-c:a", "copy", "-frames:v", str(C["FRAMES"]),
             os.path.join(out, "preview.mp4")])


if __name__ == "__main__":
    main()
