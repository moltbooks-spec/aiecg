#!/usr/bin/env python3
"""
AIECG baseline inference script — runs the trained ResNet1D-Wang model on a
PTB-XL record (records100, 100 Hz, 12 leads × 1000 samples) and prints the
superclass probabilities (NORM / MI / STTC / CD / HYP).

Usage:
  python infer_baseline.py <path-to-record-without-extension>
  python infer_baseline.py --demo     # runs on the stratified sample

Part of the per-lead pipeline: the model's 5-class output complements the
vision-model per-lead reading as an independent signal-processing cross-check.
"""
import argparse
import json
import os
import sys

import numpy as np
import torch

HERE = os.path.dirname(os.path.abspath(__file__))
MODELS_DIR = os.path.join(os.path.dirname(HERE), 'data', 'models')
PTBXL_DIR = os.path.join(os.path.dirname(HERE), 'external', 'ecg_ptbxl_benchmarking', 'data', 'ptbxl')

# reuse the architecture definition from the trainer
sys.path.insert(0, HERE)
from train_baseline import ResNet1D  # noqa: E402

SUPERCLASSES = ['NORM', 'MI', 'STTC', 'CD', 'HYP']


def load_model():
    model = ResNet1D()
    state = torch.load(os.path.join(MODELS_DIR, 'resnet1d_baseline.pt'), map_location='cpu')
    model.load_state_dict(state)
    model.eval()
    with open(os.path.join(MODELS_DIR, 'scaler.json')) as f:
        scaler = json.load(f)
    return model, np.array(scaler['mean']), np.array(scaler['std'])


def predict(model, mean, std, sig: np.ndarray):
    """sig: (12, N) float array in mV; returns {class: prob}."""
    x = sig.astype(np.float32)
    if x.shape[1] > 1000:
        x = x[:, :1000]
    elif x.shape[1] < 1000:
        x = np.pad(x, ((0, 0), (0, 1000 - x.shape[1])))
    x = (x - mean[:, None].astype(np.float32)) / (std[:, None].astype(np.float32) + 1e-6)
    with torch.no_grad():
        logits = model(torch.from_numpy(np.ascontiguousarray(x[None])))
        probs = torch.softmax(logits, dim=1).numpy()[0]
    return {SUPERCLASSES[i]: float(probs[i]) for i in range(len(SUPERCLASSES))}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('record', nargs='?', help='path to WFDB record (without extension)')
    ap.add_argument('--demo', action='store_true', help='run on the stratified sample')
    args = ap.parse_args()

    model, mean, std = load_model()

    if args.demo or not args.record:
        with open(os.path.join(os.path.dirname(PTBXL_DIR), 'sample_manifest.json')) as f:
            manifest = json.load(f)
        import wfdb
        print(f'{"record":<28} {"class-label":<12} probabilities')
        for cls_name, files in manifest.items():
            for fn in files:
                rec = wfdb.rdrecord(os.path.join(PTBXL_DIR, fn))
                sig = rec.p_signal.T
                probs = predict(model, mean, std, sig)
                top = max(probs, key=probs.get)
                pstr = ' '.join(f'{k}={v:.2f}' for k, v in probs.items())
                print(f'{fn:<28} {cls_name:<12} top={top:<5} {pstr}')
    else:
        import wfdb
        rec = wfdb.rdrecord(args.record)
        if rec.n_sig != 12:
            print(f'expected 12 leads, got {rec.n_sig}')
            sys.exit(1)
        probs = predict(model, mean, std, rec.p_signal.T)
        for k, v in sorted(probs.items(), key=lambda kv: -kv[1]):
            print(f'{k}: {v:.3f}')


if __name__ == '__main__':
    main()
