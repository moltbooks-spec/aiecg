#!/usr/bin/env python3
"""
AIECG ECG image digitizer — converts an uploaded ECG image (PNG/JPEG) into
per-lead digital signal arrays (mV), following the signal-processing
conventions of wfdb-python / NeuroKit2 (baseline correction, grid calibration).

Pipeline:
  1. Detect the ECG paper grid (red/pink lines) to calibrate mm -> pixels
     (standard paper: 1 small square = 1 mm = 40 ms x 0.1 mV; 25 mm/s, 10 mm/mV).
  2. Segment the image into lead lanes (12-lead layout: rows of labeled lanes).
  3. For each lane: extract the trace (dark pixels) -> centerline y(x),
     calibrate to mV via the grid scale.
  4. Resample to 100 Hz (PTB-XL records100 convention) and round to µV.
  5. Output JSON: { leads: {name: [..]}, samplingHz, durationS, method, notes }

Usage:
  python digitize-ecg.py <image> [--out out.json] [--hz 100]
Reads image path; writes JSON to stdout or --out.
"""
import argparse
import json
import sys

import numpy as np


def load_image(path):
    from PIL import Image
    im = Image.open(path)
    return np.asarray(im.convert('RGB'), dtype=np.uint8)


# ---------------------------------------------------------------- grid calibration

def detect_grid_scale(rgb):
    """Find small-square size in pixels by detecting the red grid lines.

    Returns (square_px, confidence) or (None, 0).
    """
    r = rgb[:, :, 0].astype(np.int16)
    g = rgb[:, :, 1].astype(np.int16)
    b = rgb[:, :, 2].astype(np.int16)
    # red/pink grid: R notably above G and B
    grid = (r - np.maximum(g, b) > 25) & (r > 120)
    if grid.sum() < 500:
        return None, 0.0
    # strongest horizontal grid-line periods via row-mass autocorrelation
    row_mass = grid.sum(axis=1).astype(np.float64)
    col_mass = grid.sum(axis=0).astype(np.float64)

    def best_period(mass, lo=8, hi=120):
        """Return the grid period (1 small square = 1 mm) in pixels.

        ECG paper: 1 mm small squares; every 5th line darker (big square).
        Autocorrelation on grid-line mass peaks at the strongest repeating
        interval — for most scans that is the small square, for some renders
        the big square dominates. We return the raw best period; the caller
        validates physically (duration & amplitude sanity).
        """
        m = mass - mass.mean()
        if (m * m).sum() == 0:
            return None
        best, best_r = None, 0.0
        for p in range(lo, hi):
            num = (m[:-p] * m[p:]).sum()
            den = np.sqrt((m[:-p] ** 2).sum() * (m[p:] ** 2).sum())
            if den > 0:
                r = num / den
                if r > best_r:
                    best, best_r = p, r
        return (best, best_r) if best else None

    pr = best_period(row_mass)
    pc = best_period(col_mass)
    cands = [x for x in (pr, pc) if x]
    if not cands:
        return None, 0.0
    # prefer the stronger axis; grid squares are equal in both
    best, conf = max(cands, key=lambda x: x[1])
    # refine: average both if they agree within 20%
    if pr and pc and abs(pr[0] - pc[0]) / max(pr[0], pc[0]) < 0.2:
        best = int(round((pr[0] + pc[0]) / 2))
        conf = min(1.0, (pr[1] + pc[1]) / 2)
    return int(best), float(conf)


# ---------------------------------------------------------------- lane segmentation

def extract_trace_mask(rgb):
    """Dark trace pixels (the ECG waveform itself)."""
    lum = rgb.mean(axis=2)
    # trace is near-black; grid is reddish; paper is light
    r = rgb[:, :, 0].astype(np.int16)
    g = rgb[:, :, 1].astype(np.int16)
    is_dark = lum < 110
    is_neutral = np.abs(r - g) < 60  # not strongly red
    return is_dark & is_neutral


LEAD_LAYOUTS = [
    # 3 rows x 4 columns (common on modern digital ECG machines)
    [
        ['I', 'aVR', 'V1', 'V4'],
        ['II', 'aVL', 'V2', 'V5'],
        ['III', 'aVF', 'V3', 'V6'],
    ],
    # 4 rows x 3 columns (classic layout)
    [
        ['I', 'II', 'III'],
        ['aVR', 'aVL', 'aVF'],
        ['V1', 'V2', 'V3'],
        ['V4', 'V5', 'V6'],
    ],
]


def detect_layout(trace, H):
    """Detect 3x4 vs 4x3 layout and return (layout, row_bands, rhythm_band).

    row_bands: content bands for the main lead rows.
    rhythm_band: (y0, y1) of a bottom full-width rhythm strip, or None.
    """
    row_any = trace.any(axis=1)
    bands = []
    in_b = False
    for y, v in enumerate(row_any):
        if v and not in_b:
            y0 = y
            in_b = True
        elif not v and in_b:
            if y - y0 > H * 0.025:  # keep thin traces (labels excluded later)
                bands.append((y0, y))
            in_b = False
    if in_b and H - y0 > H * 0.025:
        bands.append((y0, H))

    # drop a leading header band if it is much thinner than the median band
    # (page titles, calibration pulses at top)
    if len(bands) > 3:
        heights = [b[1] - b[0] for b in bands]
        med = sorted(heights)[len(heights) // 2]
        if heights[0] < 0.45 * med:
            bands = bands[1:]

    # A rhythm strip is the LAST band when we already have >= 3 main bands and
    # it sits in the bottom ~quarter of the page
    rhythm_band = None
    if len(bands) >= 4 and bands[-1][0] > H * 0.72:
        rhythm_band = bands.pop()

    if len(bands) >= 4:
        return LEAD_LAYOUTS[1], bands, rhythm_band  # 4x3
    return LEAD_LAYOUTS[0], bands, rhythm_band      # 3x4 (default)


def segment_lanes(mask):
    """Split the trace mask into lanes by column gaps; return list of lane masks."""
    col_any = mask.any(axis=0)
    # find contiguous column bands
    bands = []
    in_band = False
    for x, v in enumerate(col_any):
        if v and not in_band:
            start = x
            in_band = True
        elif not v and in_band:
            if x - start > 40:  # min lane width
                bands.append((start, x))
            in_band = False
    if in_band and len(col_any) - start > 40:
        bands.append((start, len(col_any)))
    return bands


def lane_centerline(lane_mask):
    """Extract the waveform y(x) as the weighted center of dark pixels per column."""
    h, w = lane_mask.shape
    ys = np.arange(h, dtype=np.float64)
    sig = np.full(w, np.nan)
    counts = np.zeros(w)
    for x in range(w):
        col = lane_mask[:, x]
        n = col.sum()
        if n == 0:
            continue
        sig[x] = ys[col].mean()
        counts[x] = n
    # interpolate gaps
    valid = ~np.isnan(sig)
    if valid.sum() < 10:
        return None
    xs = np.arange(w)
    sig = np.interp(xs, xs[valid], sig[valid])
    return sig


# ---------------------------------------------------------------- main digitize

def digitize(image_path, target_hz=100):
    rgb = load_image(image_path)
    H, W, _ = rgb.shape

    square_px, grid_conf = detect_grid_scale(rgb)
    if square_px is None:
        square_px = max(8, W // 120)  # fallback: assume ~120 squares wide
        grid_conf = 0.0

    mm_to_px = square_px            # 1 mm = 1 small square
    mv_per_px = 0.1 / mm_to_px      # 0.1 mV per mm at 10 mm/mV
    sec_per_px = 0.04 / mm_to_px    # 40 ms per mm at 25 mm/s

    trace = extract_trace_mask(rgb)

    layout, row_bands, rhythm_band = detect_layout(trace, H)
    n_rows = len(layout)

    # Center each row slot on its detected content band (the band is where the
    # trace actually lives; equal splits can misalign when margins differ).
    row_h = H / n_rows
    lanes = []
    for ri in range(n_rows):
        y0, y1 = int(ri * row_h), int((ri + 1) * row_h)
        if ri < len(row_bands):
            by0, by1 = row_bands[ri]
            mid = (by0 + by1) / 2
            y0 = int(max(0, mid - row_h / 2))
            y1 = int(min(H, y0 + row_h))
        # exclude the rhythm strip zone from the bottom row
        if rhythm_band and y1 > rhythm_band[0]:
            y1 = min(y1, rhythm_band[0])
        # shave 8% margins top/bottom to avoid bleeding from adjacent rows
        pad = int((y1 - y0) * 0.08)
        row_mask = trace[y0 + pad:y1 - pad, :]
        bands = segment_lanes(row_mask)
        # keep the widest n_cols lanes
        n_cols = len(layout[ri])
        bands = sorted(bands, key=lambda b: b[1] - b[0], reverse=True)[:n_cols]
        bands.sort()  # left-to-right
        for bi, band in enumerate(bands):
            if bi < n_cols:
                lanes.append((layout[ri][bi], row_mask[:, band[0]:band[1]]))

    if len(lanes) < 12:
        return {
            'ok': False,
            'method': 'grid-trace-v1',
            'reason': f'only {len(lanes)}/12 lanes detected',
            'gridConfidence': grid_conf,
        }

    signals = {}
    for name, lane in lanes:
        y = lane_centerline(lane)
        if y is None:
            signals[name] = []
            continue
        # vertical flip (image y grows down): voltage = (baseline - y) * mv_per_px
        baseline = np.median(y)
        volts = (baseline - y) * mv_per_px
        # resample x-axis (pixels -> time) to target_hz
        n_samples = int(len(volts) * sec_per_px * target_hz)
        if n_samples < 10:
            signals[name] = [round(float(v), 5) for v in volts]
            continue
        idx = np.linspace(0, len(volts) - 1, n_samples)
        resampled = np.interp(idx, np.arange(len(volts)), volts)
        signals[name] = [round(float(v), 5) for v in resampled]

    duration = max((len(v) for v in signals.values()), default=0) / target_hz

    # ---- physical sanity: a 12-lead lane should span roughly 2.5–12 s ----
    # If the computed duration is implausible, the grid period was probably a
    # BIG square (5 mm): retry the TIME axis with /5 scale (amplitude stays).
    notes_scale = 'grid-calibrated'
    if duration < 1.8 or duration > 16.0:
        alt_sec_per_px = sec_per_px / 5.0
        alt_signals = {}
        for name, lane in lanes:
            y = lane_centerline(lane)
            if y is None:
                alt_signals[name] = []
                continue
            baseline = np.median(y)
            volts = (baseline - y) * mv_per_px
            n_samples = int(len(volts) * alt_sec_per_px * target_hz)
            if n_samples < 10:
                alt_signals[name] = [round(float(v), 5) for v in volts]
                continue
            idx = np.linspace(0, len(volts) - 1, n_samples)
            resampled = np.interp(idx, np.arange(len(volts)), volts)
            alt_signals[name] = [round(float(v), 5) for v in resampled]
        alt_duration = max((len(v) for v in alt_signals.values()), default=0) / target_hz
        # accept the alternative if it lands in the plausible window
        if 1.8 <= alt_duration <= 16.0:
            signals = alt_signals
            duration = alt_duration
            notes_scale = 'grid-calibrated (5:1 big-square time correction)'
        else:
            notes_scale = 'grid-calibrated (duration outside typical range — verify)'
    return {
        'ok': True,
        'method': 'grid-trace-v1',
        'samplingHz': target_hz,
        'durationS': round(float(duration), 2),
        'gridConfidence': round(float(grid_conf), 3),
        'leads': signals,
        'notes': notes_scale
        if grid_conf > 0.3
        else 'assumed-standard paper scale (grid not detected clearly)',
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('image')
    ap.add_argument('--out')
    ap.add_argument('--hz', type=int, default=100)
    args = ap.parse_args()
    result = digitize(args.image, args.hz)
    out = json.dumps(result)
    if args.out:
        with open(args.out, 'w') as f:
            f.write(out)
        print(f'wrote {args.out}', file=sys.stderr)
    else:
        print(out)


if __name__ == '__main__':
    main()
