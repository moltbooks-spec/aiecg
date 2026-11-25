"""Generate a realistic synthetic 12-lead ECG image for testing."""
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

# ---------- ECG waveform model ----------
def ecg_beat(t, amp_r=1.0, amp_p=0.15, amp_t=0.30, amp_s=-0.25, amp_q=-0.08):
    """One PQRST complex centered so that R peak is at t=0.2s of the beat."""
    def g(center, width, amp):
        return amp * np.exp(-((t - center) ** 2) / (2 * width ** 2))
    p = g(0.10, 0.045, amp_p)
    q = g(0.185, 0.012, amp_q)
    r = g(0.205, 0.013, amp_r)
    s = g(0.228, 0.016, amp_s)
    tt = g(0.42, 0.055, amp_t)
    return p + q + r + s + tt

def lead_signal(duration, hr=75, amp=(1.0, 0.15, 0.30, -0.25, -0.08), noise=0.015):
    rr = 60.0 / hr
    t = np.arange(0, duration, 0.002)
    sig = np.zeros_like(t)
    n_beats = int(duration / rr) + 2
    for b in range(n_beats):
        start = b * rr
        mask = (t >= start) & (t < start + 0.65)
        if not np.any(mask):
            break
        sig[mask] += ecg_beat(t[mask] - start, *amp)
    # gentle baseline wander + noise
    sig += 0.03 * np.sin(2 * np.pi * 0.25 * t) + np.random.normal(0, noise, len(t))
    return t, sig

# lead amplitude profiles (r, p, t, s, q)
LEADS = {
    'I':    (0.55, 0.10, 0.25, -0.15, -0.05),
    'II':   (0.95, 0.18, 0.32, -0.20, -0.08),
    'III':  (0.45, 0.10, 0.18, -0.10, -0.04),
    'aVR':  (-0.45, -0.08, -0.20, 0.15, 0.05),
    'aVL':  (0.30, 0.06, 0.15, -0.10, -0.03),
    'aVF':  (0.70, 0.14, 0.25, -0.15, -0.06),
    'V1':   (0.25, 0.05, 0.10, -0.65, -0.02),
    'V2':   (0.55, 0.08, 0.25, -0.75, -0.03),
    'V3':   (0.80, 0.10, 0.30, -0.55, -0.05),
    'V4':   (1.10, 0.12, 0.35, -0.35, -0.06),
    'V5':   (1.05, 0.14, 0.35, -0.22, -0.07),
    'V6':   (0.85, 0.14, 0.32, -0.15, -0.06),
}

# ---------- canvas: ECG paper ----------
fig_w, fig_h = 11.0, 8.5
fig = plt.figure(figsize=(fig_w, fig_h), dpi=110)
fig.patch.set_facecolor('#ffffff')
ax = fig.add_axes([0, 0, 1, 1])
ax.set_xlim(0, fig_w)
ax.set_ylim(0, fig_h)
ax.axis('off')

def draw_grid(x0, y0, w, h, small_s=0.5, big_s=2.5):
    """ECG-paper grid: small squares light red, big squares stronger red."""
    # small grid
    for x in np.arange(x0, x0 + w + 1e-6, small_s):
        ax.plot([x, x], [y0, y0 + h], color='#ffd7d7', lw=0.5, zorder=1)
    for y in np.arange(y0, y0 + h + 1e-6, small_s):
        ax.plot([x0, x0 + w], [y, y], color='#ffd7d7', lw=0.5, zorder=1)
    # big grid
    for x in np.arange(x0, x0 + w + 1e-6, big_s):
        ax.plot([x, x], [y0, y0 + h], color='#ffb3b3', lw=0.9, zorder=2)
    for y in np.arange(y0, y0 + h + 1e-6, big_s):
        ax.plot([x0, x0 + w], [y, y], color='#ffb3b3', lw=0.9, zorder=2)

np.random.seed(42)

# Layout: 3 rows x 4 cols of leads + rhythm strip at bottom
margin_x, top = 0.35, 7.95
cell_w, cell_h = 2.62, 1.85
gap_x, gap_y = 0.05, 0.12
row_order = [['I', 'aVR', 'V1', 'V4'], ['II', 'aVL', 'V2', 'V5'], ['III', 'aVF', 'V3', 'V6']]

def mV_to_y(v):  # 10 mm/mV -> 0.28 inch per mV
    return v * 0.30

for r, row_leads in enumerate(row_order):
    for c, name in enumerate(row_leads):
        x0 = margin_x + c * (cell_w + gap_x)
        y0 = top - cell_h - r * (cell_h + gap_y)
        draw_grid(x0, y0, cell_w, cell_h)
        # label
        ax.text(x0 + 0.08, y0 + cell_h - 0.22, name, fontsize=10, color='#c0392b',
                fontweight='bold', va='center')
        # signal: 2.5 s window
        amps = LEADS[name]
        t, sig = lead_signal(2.7, hr=76, amp=amps)
        xs = x0 + (t - 0.15) / 2.5 * cell_w
        ys = y0 + cell_h * 0.52 + mV_to_y(sig)
        keep = (xs >= x0) & (xs <= x0 + cell_w)
        ax.plot(xs[keep], ys[keep], color='#1a1a2e', lw=1.1, zorder=5)

# rhythm strip (lead II, 10 s)
rs_y0, rs_h = 0.55, 1.45
draw_grid(margin_x, rs_y0, fig_w - 2 * margin_x, rs_h)
ax.text(margin_x + 0.08, rs_y0 + rs_h - 0.22, 'II', fontsize=10, color='#c0392b',
        fontweight='bold', va='center')
t, sig = lead_signal(10.3, hr=76, amp=LEADS['II'])
xs = margin_x + (t - 0.15) / 10.0 * (fig_w - 2 * margin_x)
ys = rs_y0 + rs_h * 0.5 + mV_to_y(sig)
keep = (xs >= margin_x) & (xs <= fig_w - margin_x)
ax.plot(xs[keep], ys[keep], color='#1a1a2e', lw=1.1, zorder=5)

# calibration pulse at start of lead I row (standard 0.2s * 1mV square)
cx0 = margin_x + 0.02
cy_base = top - cell_h * 0.52
cal_x = [cx0, cx0, cx0 + 0.22, cx0 + 0.22, cx0 + 0.42]
cal_y = [cy_base, cy_base + mV_to_y(1), cy_base + mV_to_y(1), cy_base, cy_base]

# annotations
ax.text(fig_w - 0.45, top + 0.18, '25 mm/s   10 mm/mV', fontsize=9, color='#444444',
        ha='right', va='center')
ax.text(fig_w - 0.45, top + 0.42, 'YAARAB SYNTHETIC ECG — TEST', fontsize=8, color='#888888',
        ha='right', va='center')

plt.savefig('/home/z/my-project/assets/test-ecg.png', dpi=110, facecolor='#ffffff')
print('saved /home/z/my-project/assets/test-ecg.png')
