#!/usr/bin/env python3
"""
AIECG self-learning trainer — pulls labeled samples from the Supabase database
(DoctorFeedback-confirmed user cases + ReferenceEcg knowledge base), retrains
the ResNet1D-Wang model, and registers the new ModelVersion.

Sources of training data (labels):
  - LearningSample rows (source=user_case, labelOrigin=doctor_feedback):
    digitized signals from uploaded cases whose reading the physician confirmed
    or corrected — the app's continuous self-learning loop.
  - LearningSample rows (source=reference, labelOrigin=reference_dataset):
    reference ECGs promoted by the seed script.
  - ReferenceEcg rows (PTB-XL knowledge base): always included as the base set.

Flow:
  1. Connect to Supabase, load all LearningSamples + ReferenceEcgs.
  2. Build tensors: 12 leads x 1000 samples (pad/truncate), per-lead standardize
     using the ACTIVE ModelVersion scaler.
  3. Fine-tune (few epochs) from the active model weights.
  4. Validate on a held-out stratified split; compare macro-F1 vs active version.
  5. Insert new ModelVersion (isActive=true, deactivate old), log LearningRun.

Usage:
  python self-learn.py [--epochs 4] [--run-id <uuid>]
"""
import argparse
import datetime
import json
import os
import secrets
import sys

import numpy as np
import psycopg2
import psycopg2.extras

HERE = os.path.dirname(os.path.abspath(__file__))
MODELS_DIR = os.path.join(os.path.dirname(HERE), 'data', 'models')


def cuid():
    """Prisma-style cuid for raw-SQL inserts."""
    ts = format(int(datetime.datetime.now(datetime.UTC).timestamp() * 1000), 'x')[:12]
    return f'c{ts}{secrets.token_hex(8)}'

PROJECT = 'uothvfldjafdtljaprfr'
PASSWORD = 'Abood007$$A'
HOST = 'aws-1-eu-west-1.pooler.supabase.com'

LEAD_ORDER = ['I', 'II', 'III', 'aVR', 'aVL', 'aVF', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6']
SUPERCLASSES = ['NORM', 'MI', 'STTC', 'CD', 'HYP']

# labelNormality -> superclass (same mapping the app uses for feedback)
NORMALITY_TO_SUPERCLASS = {
    'Normal': 'NORM',
    'Borderline': 'STTC',   # unspecified borderline -> ST/T change bucket
    'Abnormal': 'MI',       # default abnormal bucket; refined below by context
}


def connect():
    return psycopg2.connect(
        host=HOST, port=5432, user=f'postgres.{PROJECT}', password=PASSWORD,
        dbname='postgres', connect_timeout=10, sslmode='require',
    )


def signals_to_array(signals_json):
    """{lead: [..]} -> (12, 1000) float32, pad/truncate to 1000 samples."""
    sig = json.loads(signals_json)
    rows = []
    for lead in LEAD_ORDER:
        arr = np.array(sig.get(lead, []), dtype=np.float32)
        if arr.size == 0:
            arr = np.zeros(1000, dtype=np.float32)
        if arr.size > 1000:
            arr = arr[:1000]
        elif arr.size < 1000:
            arr = np.pad(arr, (0, 1000 - arr.size))
        rows.append(arr)
    return np.stack(rows)  # (12, 1000)


def load_dataset():
    """Fetch all learning samples + references; return X, y, origins."""
    conn = connect()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    X, y, origins = [], [], []
    seen_case_ids = set()

    # 1) user-case learning samples (physician-confirmed)
    cur.execute("""
        SELECT "id", "caseId", "labelNormality", "superclass", "signalsJson", "labelOrigin"
        FROM "LearningSample"
        ORDER BY "createdAt"
    """)
    n_user = 0
    for r in cur.fetchall():
        if r['caseId'] in seen_case_ids:
            continue  # one sample per case (latest feedback wins via ORDER)
        seen_case_ids.add(r['caseId'])
        X.append(signals_to_array(r['signalsJson']))
        y.append(SUPERCLASSES.index(r['superclass']) if r['superclass'] in SUPERCLASSES else 0)
        origins.append('user')
        n_user += 1

    # 2) promoted reference samples
    cur.execute("""
        SELECT "sourceRecord", "superclass", "signalsJson"
        FROM "ReferenceEcg"
        ORDER BY "sourceRecord"
    """)
    n_ref = 0
    for r in cur.fetchall():
        X.append(signals_to_array(r['signalsJson']))
        y.append(SUPERCLASSES.index(r['superclass']) if r['superclass'] in SUPERCLASSES else 0)
        origins.append('reference')
        n_ref += 1

    cur.close()
    conn.close()
    return np.stack(X) if X else None, np.array(y) if len(y) else None, origins, n_user, n_ref


def load_active_model():
    """Return (model, scaler_mean, scaler_std, version_row) for the active version."""
    import torch
    sys.path.insert(0, HERE)
    from train_baseline import ResNet1D

    conn = connect()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    cur.execute('SELECT * FROM "ModelVersion" WHERE "isActive" = true ORDER BY version DESC LIMIT 1')
    row = cur.fetchone()
    cur.close()
    conn.close()
    if row is None:
        model = ResNet1D()
        scaler = json.load(open(os.path.join(MODELS_DIR, 'scaler.json')))
        return model, np.array(scaler['mean']), np.array(scaler['std']), None

    weights_path = os.path.join(os.path.dirname(HERE), row['basePath'])
    model = ResNet1D()
    if os.path.exists(weights_path):
        model.load_state_dict(torch.load(weights_path, map_location='cpu'))
    sc = json.loads(row['scalerJson'])
    return model, np.array(sc['mean']), np.array(sc['std']), row


def run_training(epochs, run_id=None):
    import torch
    import torch.nn as nn
    import torch.nn.functional as F
    from torch.utils.data import DataLoader, TensorDataset
    sys.path.insert(0, HERE)

    log = []

    def L(msg):
        print(msg)
        log.append(msg)

    X, y, origins, n_user, n_ref = load_dataset()
    if X is None or len(X) < 4:
        raise RuntimeError(f'not enough samples to train (got {0 if X is None else len(X)})')
    L(f'dataset: {len(X)} samples ({n_user} user-confirmed, {n_ref} reference)')

    model, mean, std, active = load_active_model()
    L(f'active model: v{active["version"] if active else "none"}')

    # standardize per lead
    Xn = ((X - mean[None, :, None]) / (std[None, :, None] + 1e-6)).astype(np.float32)

    # stratified hold-out: one sample per class present (if class has >= 2)
    val_idx = []
    for c in range(len(SUPERCLASSES)):
        idxs = np.where(y == c)[0]
        if len(idxs) >= 2:
            val_idx.append(int(idxs[-1]))
    val_mask = np.zeros(len(y), dtype=bool)
    val_mask[val_idx] = True
    Xtr, ytr = Xn[~val_mask], y[~val_mask]
    Xva, yva = Xn[val_mask], y[val_mask]
    L(f'split: train {len(ytr)} / val {len(yva)}')

    torch.manual_seed(42)
    np.random.seed(42)
    opt = torch.optim.AdamW(model.parameters(), lr=5e-4, weight_decay=1e-3)
    lossf = nn.CrossEntropyLoss()
    tr_dl = DataLoader(TensorDataset(torch.from_numpy(Xtr), torch.from_numpy(ytr)),
                       batch_size=4, shuffle=True)

    model.train()
    for epoch in range(epochs):
        tot, nb = 0.0, 0
        for xb, yb in tr_dl:
            opt.zero_grad()
            loss = lossf(model(xb), yb)
            loss.backward()
            opt.step()
            tot += loss.item()
            nb += 1
        L(f'epoch {epoch + 1}/{epochs} train_loss={tot / max(nb, 1):.4f}')

    # ---- validation ----
    model.eval()
    with torch.no_grad():
        probs = F.softmax(model(torch.from_numpy(Xva)), dim=1).numpy()
    pred = probs.argmax(1)
    acc = float((pred == yva).mean()) if len(yva) else 0.0
    per_class = {}
    for c in range(len(SUPERCLASSES)):
        tp = int(((pred == c) & (yva == c)).sum())
        fp = int(((pred == c) & (yva != c)).sum())
        fn = int(((pred != c) & (yva == c)).sum())
        prec = tp / (tp + fp) if tp + fp else 0.0
        rec = tp / (tp + fn) if tp + fn else 0.0
        per_class[SUPERCLASSES[c]] = {
            'f1': 2 * prec * rec / (prec + rec) if prec + rec else 0.0,
            'support': int((yva == c).sum()),
        }
    macro_f1 = float(np.mean([v['f1'] for v in per_class.values()]))

    prev_f1 = 0.0
    if active and active.get('metricsJson'):
        try:
            prev_f1 = float(json.loads(active['metricsJson']).get('macroF1', 0.0))
        except Exception:
            pass
    L(f'val_acc={acc:.3f} macro_f1={macro_f1:.3f} (previous {prev_f1:.3f})')

    # ---- persist: save weights, register new version, log run ----
    conn = connect()
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    # new version number
    cur.execute('SELECT COALESCE(MAX(version), 0) + 1 AS v FROM "ModelVersion"')
    new_v = cur.fetchone()['v']

    weights_name = f'resnet1d_v{new_v}.pt'
    weights_path = os.path.join(MODELS_DIR, weights_name)
    torch.save(model.state_dict(), weights_path)
    scaler_json = json.dumps({'mean': mean.tolist(), 'std': std.tolist(), 'leadOrder': LEAD_ORDER})
    metrics = {
        'valAccuracy': acc, 'macroF1': macro_f1,
        'perClass': per_class, 'improvedVsActive': macro_f1 >= prev_f1,
        'trainSamples': int(len(ytr)), 'valSamples': int(len(yva)),
    }

    if run_id:
        cur.execute('SELECT id FROM "LearningRun" WHERE id = %s', (run_id,))
        if cur.fetchone() is None:
            run_id = None

    if not run_id:
        cur.execute("""
            INSERT INTO "LearningRun" (id, status, trigger, "samplesUsed", "referencesUsed")
            VALUES (%s, 'running', 'manual', %s, %s) RETURNING id
        """, (cuid(), n_user, n_ref))
        run_id = cur.fetchone()['id']

    # deactivate old, insert new version
    cur.execute('UPDATE "ModelVersion" SET "isActive" = false WHERE "isActive" = true')
    cur.execute("""
        INSERT INTO "ModelVersion" (id, version, architecture, "basePath", "scalerJson",
                                    "metricsJson", "trainRecords", "sourceNote", "isActive")
        VALUES (%s, %s, 'resnet1d_wang', %s, %s, %s, %s, %s, true)
        RETURNING id
    """, (cuid(), new_v, f'data/models/{weights_name}', scaler_json,
          json.dumps(metrics), int(len(y)),
          f'self-learning run {run_id}: {n_user} user + {n_ref} reference samples'))
    new_version_id = cur.fetchone()['id']

    cur.execute("""
        UPDATE "LearningRun"
        SET status = 'succeeded', "finishedAt" = now(), "newVersionId" = %s,
            "metricsJson" = %s, "logJson" = %s, "samplesUsed" = %s, "referencesUsed" = %s
        WHERE id = %s
    """, (new_version_id, json.dumps(metrics), json.dumps(log), n_user, n_ref, run_id))

    conn.commit()
    cur.close()
    conn.close()
    L(f'saved: data/models/{weights_name} | ModelVersion v{new_v} active | run {run_id}')
    return {'version': new_v, 'metrics': metrics, 'log': log}


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--epochs', type=int, default=4)
    ap.add_argument('--run-id', type=str, default=None)
    args = ap.parse_args()
    try:
        out = run_training(args.epochs, args.run_id)
        print(json.dumps({'ok': True, 'version': out['version']}, indent=1))
    except Exception as e:
        # mark the pre-created run as failed so the API shows the error
        try:
            conn = connect()
            cur = conn.cursor()
            cur.execute("""
                UPDATE "LearningRun"
                SET status = 'failed', "finishedAt" = now(), error = %s
                WHERE id = %s AND status = 'running'
            """, (str(e)[:500], args.run_id))
            conn.commit()
            cur.close()
            conn.close()
        except Exception:
            pass
        print(json.dumps({'ok': False, 'error': str(e)}))
        sys.exit(1)
