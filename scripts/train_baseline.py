#!/usr/bin/env python3
"""
AIECG baseline trainer — ResNet1D-Wang architecture (following
helme/ecg_ptbxl_benchmarking, Strodthoff et al. 2020, "Deep Learning for ECG
Analysis: Benchmarks and Insights from PTB-XL") trained on a stratified
PTB-XL v1.0.3 sample (records100, 100 Hz).

5 diagnostic superclasses: NORM / MI / STTC / CD / HYP (PTB-XL benchmark task).

CPU-only training (no GPU in this sandbox) — small sample, few epochs; this is
a working baseline pipeline, not a leaderboard model. For production, retrain
on the full PTB-XL + MIMIC-IV-ECG / CPSC2018+Georgia (PhysioNet Challenge 2021
combined set) on GPU as described in the repository's configs.

Usage:
  python train_baseline.py [--epochs 8]
Outputs:
  models/resnet1d_baseline.pt        — trained weights
  models/baseline-metrics.json        — per-class F1, macro F1, val accuracy
  models/scaler.json                  — per-lead standardization stats
"""
import argparse
import json
import os
import sys

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.utils.data import DataLoader, TensorDataset

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

# ---------------------------------------------------------------- data

PTBXL_DIR = os.path.join(
    os.path.dirname(HERE), 'external', 'ecg_ptbxl_benchmarking', 'data', 'ptbxl'
)

# superclass map from PTB-XL scp -> diagnostic_class (from scp_statements.csv)
SUPERCLASSES = ['NORM', 'MI', 'STTC', 'CD', 'HYP']


def class_of_record(scp_codes: str) -> int:
    """Map a record's scp_codes dict-string to a superclass index (primary: highest prob)."""
    import ast
    try:
        codes = ast.literal_eval(scp_codes)
    except Exception:
        return -1
    # benchmark superclassing: any code whose diagnostic_class is set
    # we approximate by keyword mapping consistent with the benchmark's task
    kw_map = {
        'NORM': 0,
        'IMI': 1, 'AMI': 1, 'ALMI': 1, 'INJAS': 1, 'LMI': 1, 'INJAL': 1, 'INJLA': 1,
        'PMI': 1, 'INJIN': 1, 'INJIL': 1,
        'STTC': 2, 'NDT': 2, 'NST_': 2, 'DIG': 2, 'NSTE': 2, 'ELSTTC': 2, 'LNGQT': 2,
        'AFLT': 3, 'AFIB': 3, 'SVTAC': 3, 'PAC': 3, 'PVC': 3,
        'CLBBB': 3, 'CRBBB': 3, 'IRBBB': 3, 'ILBBB': 3, 'LPFB': 3, 'LAFB': 3, '1AVB': 3, 'IVCD': 3,
        'LBBB': 3, 'RBBB': 3, 'WPW': 3, 'SBRAD': 3, 'STACH': 3, 'ABRV': 3,
        'LVH': 4, 'RVH': 4, 'LAEH': 4, 'RAEH': 4, 'SEHYP': 4, 'HYPST': 4, 'HYPATH': 4,
        'SVPB': 3, 'VPB': 3, 'BIGE': 3, 'AIVB': 3, 'IDC': 3, 'TRIAM': 3,
    }
    best = -1
    for code in codes:
        idx = kw_map.get(code.strip(), -1)
        if idx > best:
            best = idx
    return best


def load_sample(manifest_path: str):
    """Load the 20-record stratified sample into (X, y) tensors."""
    import wfdb

    with open(manifest_path) as f:
        manifest = json.load(f)

    X, y, names = [], [], []
    for cls_name, files in manifest.items():
        for fn in files:
            rec_path = os.path.join(PTBXL_DIR, fn)
            try:
                rec = wfdb.rdrecord(rec_path)
                sig = rec.p_signal.T  # (12, 1000)
                X.append(sig.astype(np.float32))
                names.append(fn)
                # class from the manifest key (ground truth from stratification)
                # map manifest class key to superclass index
                cls_map = {
                    'NORM': 'NORM', 'IMI': 'MI', 'LMI': 'MI', 'ASMI': 'MI',
                    'STTC': 'STTC', 'LVH': 'HYP', 'AFIB': 'CD', 'LBBB': 'CD',
                    'RBBB': 'CD', 'CLBBB': 'CD', 'CRBBB': 'CD', '1AVB': 'CD',
                }
                y.append(SUPERCLASSES.index(cls_map.get(cls_name, 'NORM')))
            except Exception as e:
                print(f'skip {fn}: {e}')
    return np.array(X), np.array(y), names


# ---------------------------------------------------------------- model (ResNet1D-Wang)

class WangBasicBlock1D(nn.Module):
    """Basic block of the ResNet1D-Wang architecture (batch norm + residual)."""
    def __init__(self, in_ch, out_ch, kernel, drop=0.5):
        super().__init__()
        self.bn1 = nn.BatchNorm1d(in_ch)
        self.conv1 = nn.Conv1d(in_ch, out_ch, kernel, padding='same')
        self.bn2 = nn.BatchNorm1d(out_ch)
        self.conv2 = nn.Conv1d(out_ch, out_ch, kernel, padding='same')
        self.drop = nn.Dropout(drop)
        self.downsample = (
            nn.Conv1d(in_ch, out_ch, 1) if in_ch != out_ch else nn.Identity()
        )

    def forward(self, x):
        identity = self.downsample(x)
        out = self.conv1(F.relu(self.bn1(x)))
        out = self.drop(out)
        out = self.conv2(F.relu(self.bn2(out)))
        return identity + out


class ResNet1D(nn.Module):
    """ResNet1D-Wang (per helme/ecg_ptbxl_benchmarking configs): 4 residual stages."""

    def __init__(self, in_leads=12, n_classes=5):
        super().__init__()
        chs = [128, 256, 256, 512]
        self.stem = nn.Conv1d(in_leads, 64, 1)
        blocks = []
        prev = 64
        for ch in chs:
            blocks.append(WangBasicBlock1D(prev, ch, kernel=16))
            prev = ch
        self.stages = nn.Sequential(*blocks)
        self.head = nn.Sequential(
            nn.BatchNorm1d(prev),
            nn.ReLU(),
            nn.AdaptiveAvgPool1d(1),
            nn.Flatten(),
            nn.Linear(prev, n_classes),
        )

    def forward(self, x):
        x = self.stem(x)
        x = self.stages(x)
        return self.head(x)


# ---------------------------------------------------------------- training

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--epochs', type=int, default=8)
    ap.add_argument('--batch', type=int, default=4)
    args = ap.parse_args()

    torch.manual_seed(42)
    np.random.seed(42)

    manifest = os.path.join(
        os.path.dirname(HERE), 'external', 'ecg_ptbxl_benchmarking', 'data', 'sample_manifest.json'
    )
    X, y, names = load_sample(manifest)
    print(f'loaded {X.shape[0]} records, shape {X.shape}, classes: {np.bincount(y)}')

    # standardize per lead
    mean = X.mean(axis=(0, 2), keepdims=True).astype(np.float32)   # (1,12,1)
    std = X.std(axis=(0, 2), keepdims=True).astype(np.float32) + 1e-6
    Xn = (X - mean) / std

    # leave-out validation: stratify by class, one record per class if possible
    val_idx = []
    for c in range(len(SUPERCLASSES)):
        idxs = np.where(y == c)[0]
        if len(idxs) >= 3:
            val_idx.append(idxs[-1])
    val_mask = np.zeros(len(y), dtype=bool)
    val_mask[val_idx] = True
    Xtr, ytr = Xn[~val_mask], y[~val_mask]
    Xva, yva = Xn[val_mask], y[val_mask]
    print(f'train {len(ytr)} / val {len(yva)}')

    device = 'cpu'
    model = ResNet1D().to(device)
    opt = torch.optim.AdamW(model.parameters(), lr=1e-3, weight_decay=1e-3)
    lossf = nn.CrossEntropyLoss()

    tr_ds = TensorDataset(torch.from_numpy(Xtr), torch.from_numpy(ytr))
    tr_dl = DataLoader(tr_ds, batch_size=args.batch, shuffle=True)

    for epoch in range(args.epochs):
        model.train()
        tot, nb = 0.0, 0
        for xb, yb in tr_dl:
            opt.zero_grad()
            out = model(xb)
            loss = lossf(out, yb)
            loss.backward()
            opt.step()
            tot += loss.item()
            nb += 1
        print(f'epoch {epoch + 1}/{args.epochs}  train_loss={tot / nb:.4f}')

    # ---- validation metrics ----
    model.eval()
    with torch.no_grad():
        logits = model(torch.from_numpy(Xva))
        probs = F.softmax(logits, dim=1).numpy()
        pred = probs.argmax(1)
    acc = float((pred == yva).mean())

    # per-class F1 (micro over records, robust to tiny val set)
    per_class = {}
    for c in range(len(SUPERCLASSES)):
        tp = int(((pred == c) & (yva == c)).sum())
        fp = int(((pred == c) & (yva != c)).sum())
        fn = int(((pred != c) & (yva == c)).sum())
        prec = tp / (tp + fp) if tp + fp else 0.0
        rec = tp / (tp + fn) if tp + fn else 0.0
        f1 = 2 * prec * rec / (prec + rec) if prec + rec else 0.0
        per_class[SUPERCLASSES[c]] = {'precision': prec, 'recall': rec, 'f1': f1,
                                      'support': int((yva == c).sum())}
    macro_f1 = float(np.mean([v['f1'] for v in per_class.values()]))

    out_dir = os.path.join(HERE)
    os.makedirs(out_dir, exist_ok=True)
    torch.save(model.state_dict(), os.path.join(out_dir, 'resnet1d_baseline.pt'))
    with open(os.path.join(out_dir, 'baseline-metrics.json'), 'w') as f:
        json.dump({
            'architecture': 'ResNet1D-Wang (ecg_ptbxl_benchmarking)',
            'dataset': 'PTB-XL v1.0.3 records100 stratified sample',
            'n_records': int(X.shape[0]),
            'epochs': args.epochs,
            'val_accuracy': acc,
            'macro_f1': macro_f1,
            'per_class': per_class,
            'classes': SUPERCLASSES,
            'note': 'CPU baseline on 20-record sample; retrain on full PTB-XL + '
                    'Challenge-2021 data on GPU for production metrics.',
        }, f, indent=2)
    with open(os.path.join(out_dir, 'scaler.json'), 'w') as f:
        json.dump({'mean': mean.squeeze().tolist(), 'std': std.squeeze().tolist(),
                   'lead_order': ['I', 'II', 'III', 'aVR', 'aVL', 'aVF', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6']}, f, indent=2)

    print(f'val_acc={acc:.3f}  macro_f1={macro_f1:.3f}')
    print('saved model + metrics + scaler')


if __name__ == '__main__':
    main()
