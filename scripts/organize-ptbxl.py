#!/usr/bin/env python3
"""Organize downloaded PTB-XL sample files into the standard directory structure,
then verify with wfdb-python that all 12 leads load correctly."""
import os
import shutil
import json

RAW = 'ptbxl_raw'
DST = 'ptbxl'

with open('sample_manifest.json') as f:
    manifest = json.load(f)

# every filename like 00000/00001_lr -> files are flat 00001_lr.dat/hea
moved = 0
for f in sorted(os.listdir(RAW)):
    if not (f.endswith('.dat') or f.endswith('.hea')):
        continue
    # filename_lr (e.g. 00001_lr.dat) — subdir is the first 5 digits of ecg_id
    base = f.split('.')[0]          # 00001_lr
    ecg_id = int(base.split('_')[0])  # 1
    subdir = f'{ecg_id // 1000 * 1000:05d}'  # 00000
    rel = f'{subdir}/{base}'
    target = os.path.join(DST, rel + os.path.splitext(f)[1] and f.split('.')[1] and '.' + f.split('.')[1] or '')
    # simpler: keep extension
    ext = '.' + f.split('.', 1)[1]
    final = os.path.join(DST, 'records100', subdir, base + ext)
    os.makedirs(os.path.dirname(final), exist_ok=True)
    shutil.move(os.path.join(RAW, f), final)
    moved += 1

print(f'moved {moved} files into {DST}/records100/<subdir>/')

# verify with wfdb
import wfdb
import numpy as np

ok, fail = 0, 0
for cls, files in manifest.items():
    for fn in files:
        try:
            rec = wfdb.rdrecord(os.path.join(DST, fn))
            assert rec.n_sig == 12, f'{fn}: expected 12 leads, got {rec.n_sig}'
            sig = rec.p_signal
            assert sig.shape == (1000, 12), f'{fn}: unexpected shape {sig.shape}'
            ok += 1
        except Exception as e:
            fail += 1
            print(f'FAIL {cls} {fn}: {e}')
print(f'wfdb verification: {ok} OK / {fail} FAIL')

# per-lead stats sanity (lead I..V6 order per header)
rec = wfdb.rdrecord(os.path.join(DST, 'records100/00000/00001_lr'))
print('lead order:', rec.sig_name)
print('units:', set(rec.units))
