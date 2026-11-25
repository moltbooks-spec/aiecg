#!/usr/bin/env python3
"""
Seed the Supabase knowledge base from the downloaded PTB-XL reference data:
  1. ScpCode       — 71 official SCP-ECG codes from scp_statements.csv
  2. LeadCriterion — per-lead normal criteria (standard 12-lead regional criteria)
  3. ReferenceEcg  — 20 digitized PTB-XL sample signals (stratified)
  4. ModelVersion  — register the trained ResNet1D-Wang baseline as version 1
Idempotent: upserts by unique keys.
"""
import csv
import json
import os
import sys

import psycopg2
import psycopg2.extras

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(os.path.dirname(HERE), 'external', 'ptbxl-sample')

PROJECT = 'uothvfldjafdtljaprfr'
PASSWORD = 'Abood007$$A'
HOST = 'aws-1-eu-west-1.pooler.supabase.com'
URL = os.environ.get('DATABASE_URL')

conn = psycopg2.connect(
    host=HOST, port=5432, user=f'postgres.{PROJECT}', password=PASSWORD,
    dbname='postgres', connect_timeout=10, sslmode='require',
)
conn.autocommit = False
cur = conn.cursor()

# ---------------------------------------------------------------- 1. ScpCode

def seed_scp_codes():
    with open(os.path.join(DATA, 'scp_statements.csv'), newline='', encoding='utf-8') as f:
        rdr = csv.DictReader(f)
        rows = []
        for r in rdr:
            code = (r.get('') or '').strip()
            label = (r.get('description') or '').strip()
            if not code or not label:
                continue
            rows.append((
                code,
                label,
                (r.get('diagnostic_class') or '').strip() or None,
                (r.get('diagnostic') or '').strip() == '1.0' or (r.get('diagnostic') or '').strip() == '1',
                (r.get('form') or '').strip() == '1.0' or (r.get('form') or '').strip() == '1',
                (r.get('rhythm') or '').strip() == '1.0' or (r.get('rhythm') or '').strip() == '1',
                (r.get('AHA code') or '').strip() or None,
                (r.get('DICOM Code') or '').strip() or None,
                (r.get('Statement Category') or '').strip() or None,
                (r.get('SCP-ECG Statement Description') or '').strip() or None,
            ))
    cur.executemany("""
        INSERT INTO "ScpCode" (id, label, "diagnosticClass", "isDiagnostic", "isForm",
                               "isRhythm", "ahaCode", "dicomCode", "category", "description",
                               "sourceDataset", "createdAt", "updatedAt")
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'PTB-XL v1.0.3', now(), now())
        ON CONFLICT (id) DO UPDATE SET
          label = EXCLUDED.label,
          "diagnosticClass" = EXCLUDED."diagnosticClass",
          "isDiagnostic" = EXCLUDED."isDiagnostic",
          "isForm" = EXCLUDED."isForm",
          "isRhythm" = EXCLUDED."isRhythm",
          "ahaCode" = EXCLUDED."ahaCode",
          "dicomCode" = EXCLUDED."dicomCode",
          "category" = EXCLUDED."category",
          "description" = EXCLUDED."description",
          "updatedAt" = now()
    """, rows)
    print(f'ScpCode: {len(rows)} codes upserted')
    return len(rows)

# ---------------------------------------------------------------- cuid generator (matches Prisma format)

import datetime
import secrets

_cuid_counter = secrets.randbelow(0x10000)
_cuid_fingerprint = secrets.token_hex(2)  # 4 hex chars

def cuid():
    """Generate a Prisma-style cuid (c25...) for raw-SQL inserts."""
    global _cuid_counter
    _cuid_counter = (_cuid_counter + 1) % 0x10000
    ts = format(int(datetime.datetime.utcnow().timestamp() * 1000), 'x').ljust(12, '0')[:12]
    return f'c{ts}{_cuid_fingerprint}{_cuid_counter:04x}{secrets.token_hex(2)}'

# ---------------------------------------------------------------- 2. LeadCriterion

LEAD_CRITERIA = [
    # limb leads
    ('I',    'lateral',  'normal_qrs',     'Positive QRS with small q acceptable; amplitude 5–15 mm typical'),
    ('I',    'lateral',  'normal_st_t',    'ST isoelectric; T upright and < 5 mm'),
    ('II',   'inferior', 'normal_p',       'Upright P (best rhythm lead); amplitude < 2.5 mm'),
    ('II',   'inferior', 'normal_qrs',     'Tallest limb-lead R typically; negative QRS is abnormal'),
    ('III',  'inferior', 'normal_variants','May be flat/negative in lean individuals (position-dependent)'),
    ('III',  'inferior', 'reciprocal_role','Reciprocal window for high-lateral STE (I/aVL)'),
    ('aVR',  'right',    'normal_qrs',     'Normally all-negative (rS); positive QRS requires explanation'),
    ('aVR',  'right',    'ste_alarm',      'STE in aVR + widespread STD elsewhere: left-main / triple-vessel pattern'),
    ('aVL',  'lateral',  'normal_qrs',     'Positive QRS; qR common; amplitude < 12 mm'),
    ('aVL',  'lateral',  'reciprocal_role','Reciprocal window for inferior STE (II/III/aVF)'),
    ('aVF',  'inferior', 'normal_qrs',     'Positive QRS; reflects inferior wall with II/III'),
    # precordial leads
    ('V1',   'septal',   'normal_qrs',     'S dominant; small r < 3 mm; R/S < 1'),
    ('V1',   'septal',   'normal_t',       'T may be inverted (normal up to young adulthood); upright beyond V1 mandatory'),
    ('V1',   'septal',   'posterior_mirror','Tall R + upright T + ST depression here suggests posterior MI (mirror)'),
    ('V2',   'septal',   'normal_qrs',     'R/S ≈ 1; R up to ~15 mm; tallest normal T wave'),
    ('V2',   'septal',   'posterior_mirror','Mirror-pattern lead for posterior wall with V1/V3'),
    ('V3',   'anterior', 'normal_qrs',     'Transition zone: R becomes > S; both visible'),
    ('V3',   'anterior', 'transition_zone','Normal R/S transition; PRWP or reversed transition = check placement/old MI'),
    ('V4',   'anterior', 'normal_qrs',     'R dominant and tall; apex of anterior wall'),
    ('V4',   'anterior', 'r_progression',  'R must grow monotonically V1→V4; failure = PRWP'),
    ('V5',   'lateral',  'normal_qrs',     'R up to ~25 mm; septal q normal'),
    ('V5',   'lateral',  'lvh_threshold',  'S-V1 + R-V5 > 35 mm suggests LVH'),
    ('V6',   'lateral',  'normal_qrs',     'R < 25 mm; small S < 7 mm acceptable'),
    ('V6',   'lateral',  'lvh_threshold',  'S-V1 + R-V6 > 35 mm suggests LVH (Cornell: S-V3 + R-aVL > 28 mm men)'),
]

def seed_lead_criteria():
    cur.executemany("""
        INSERT INTO "LeadCriterion" (id, lead, region, criterion, detail)
        VALUES (%s,%s,%s,%s,%s)
        ON CONFLICT (lead, criterion) DO UPDATE SET
          region = EXCLUDED.region,
          detail = EXCLUDED.detail
    """, [(cuid(), *row) for row in LEAD_CRITERIA])
    print(f'LeadCriterion: {len(LEAD_CRITERIA)} criteria upserted')
    return len(LEAD_CRITERIA)

# ---------------------------------------------------------------- 3. ReferenceEcg

# manifest class -> benchmark superclass
SUPERCLASS = {
    'NORM': 'NORM', 'IMI': 'MI', 'LMI': 'MI', 'ASMI': 'MI', 'STTC': 'STTC',
    'LVH': 'HYP', 'AFIB': 'CD', '1AVB': 'CD', 'LBBB': 'CD', 'RBBB': 'CD',
    'CLBBB': 'CD', 'CRBBB': 'CD',
}

# metadata lookup from ptbxl_database.csv
def load_metadata():
    meta = {}
    with open(os.path.join(DATA, 'ptbxl_database.csv'), newline='', encoding='utf-8') as f:
        for r in csv.DictReader(f):
            meta[int(r['ecg_id'])] = r
    return meta

def seed_reference_ecgs():
    import wfdb
    import numpy as np
    with open(os.path.join(DATA, 'sample_manifest.json')) as f:
        manifest = json.load(f)
    meta = load_metadata()
    count = 0
    for cls, files in manifest.items():
        for fn in files:
            rec = wfdb.rdrecord(os.path.join(DATA, fn))
            sig = rec.p_signal.T  # (12, 1000) float64 mV
            leads = rec.sig_name  # I II III AVR AVL AVF V1..V6
            # normalize lead spellings to app convention
            leads = ['aVR' if l == 'AVR' else 'aVL' if l == 'AVL' else 'aVF' if l == 'AVF' else l for l in leads]
            signals = {l: [round(float(v), 5) for v in sig[i]] for i, l in enumerate(leads)}
            ecg_id = int(fn.split('/')[-1].split('_')[0])
            m = meta.get(ecg_id, {})
            meta_json = json.dumps({
                'ecg_id': ecg_id,
                'age': float(m['age']) if m.get('age') else None,
                'sex': 'male' if m.get('sex') == '1' else 'female',
                'report': m.get('report'),
                'scp_codes': m.get('scp_codes'),
                'validated_by': int(float(m['validated_by'])) if m.get('validated_by') and m['validated_by'] not in ('', 'nan') else None,
            })
            cur.execute("""
                INSERT INTO "ReferenceEcg" (id, "sourceDataset", "sourceRecord", "sourceLabel",
                                            "superclass", "samplingHz", "durationS", "signalsJson", "metaJson")
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
                ON CONFLICT ("sourceDataset", "sourceRecord") DO UPDATE SET
                  "signalsJson" = EXCLUDED."signalsJson",
                  "metaJson" = EXCLUDED."metaJson"
            """, (
                cuid(), 'PTB-XL', fn, cls, SUPERCLASS.get(cls, 'NORM'),
                100, 10.0, json.dumps(signals), meta_json,
            ))
            count += 1
    print(f'ReferenceEcg: {count} records upserted')
    return count

# ---------------------------------------------------------------- 4. ModelVersion

def seed_model_version():
    models_dir = os.path.join(os.path.dirname(HERE), 'data', 'models')
    scaler_p = os.path.join(models_dir, 'scaler.json')
    metrics_p = os.path.join(models_dir, 'baseline-metrics.json')
    if not os.path.exists(scaler_p):
        print('ModelVersion: scaler.json missing — skipping (train first)')
        return 0
    scaler = open(scaler_p).read()
    metrics = open(metrics_p).read() if os.path.exists(metrics_p) else None
    cur.execute("""
        INSERT INTO "ModelVersion" (id, version, architecture, "basePath", "scalerJson",
                                    "metricsJson", "trainRecords", "sourceNote", "isActive")
        VALUES (%s, 1, 'resnet1d_wang', 'data/models/resnet1d_baseline.pt', %s, %s, 20,
                'initial PTB-XL v1.0.3 stratified sample (20 records)', true)
        ON CONFLICT (version) DO UPDATE SET
          "scalerJson" = EXCLUDED."scalerJson",
          "metricsJson" = EXCLUDED."metricsJson",
          "isActive" = true
    """, (cuid(), scaler, metrics))
    print('ModelVersion: version 1 registered (active)')
    return 1

# ---------------------------------------------------------------- run

try:
    n1 = seed_scp_codes()
    n2 = seed_lead_criteria()
    n3 = seed_reference_ecgs()
    n4 = seed_model_version()
    conn.commit()
    print(f'\nSEED COMPLETE: {n1} scp codes, {n2} lead criteria, {n3} reference ECGs, {n4} model version')
except Exception as e:
    conn.rollback()
    print(f'SEED FAILED: {e}')
    sys.exit(1)
finally:
    cur.close()
    conn.close()
