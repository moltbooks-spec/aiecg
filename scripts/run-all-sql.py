#!/usr/bin/env python3
"""
Execute ALL the delivered SQL files against the live Supabase database,
exactly as the user would from the SQL Editor, then verify the result.

Order (matches the documented setup flow):
  1. aiecg-schema.sql  — full DDL + all seed data (idempotent: IF NOT EXISTS +
     ON CONFLICT DO NOTHING; app tables untouched, data preserved)
  2. aiecg-reference-part-1-of-8.sql ... part-8-of-8.sql — the 40 reference
     ECG signal inserts (ON CONFLICT DO NOTHING)

Verification afterwards:
  - row counts per table match the SQL content
  - every ReferenceEcg row has 12 leads x 1000 samples in signalsJson
  - every ReferenceEcg row carries citation + url + license in metaJson
  - superclass distribution and dataset distribution
  - app data (User / EcgCase / DoctorFeedback) untouched
"""
import json
import os
import sys
import time

import psycopg2

DB = dict(
    host='aws-1-eu-west-1.pooler.supabase.com', port=5432,
    user='postgres.uothvfldjafdtljaprfr', password='Abood007$$A',
    dbname='postgres', connect_timeout=15, sslmode='require',
)
DL = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'download')
FILES = ['aiecg-schema.sql'] + [f'aiecg-reference-part-{i}-of-8.sql' for i in range(1, 9)]

conn = psycopg2.connect(**DB)
conn.autocommit = True
cur = conn.cursor()

# snapshot app data before, to prove the run is non-destructive
APP_TABLES = ['User', 'Session', 'EcgCase', 'ChatMessage', 'DoctorFeedback', 'LearningSample']
before = {}
for t in APP_TABLES:
    cur.execute(f'SELECT COUNT(*) FROM "{t}"')
    before[t] = cur.fetchone()[0]
print('app data before:', before)

all_ok = True
for fname in FILES:
    path = os.path.join(DL, fname)
    if not os.path.exists(path):
        print(f'MISSING FILE: {fname}')
        all_ok = False
        continue
    sql = open(path).read()
    size_kb = len(sql.encode()) // 1024
    t0 = time.time()
    try:
        cur.execute(sql)
        print(f'✓ {fname} ({size_kb} KB) executed OK in {time.time() - t0:.1f}s')
    except Exception as e:
        print(f'✗ {fname} FAILED: {str(e)[:200]}')
        all_ok = False
        break

if all_ok:
    print('\n--- verification ---')
    expected = {'ScpCode': 71, 'LeadCriterion': 24, 'ReferenceEcg': 40, 'ModelVersion': 3, 'LearningRun': 2}
    for t, exp in expected.items():
        cur.execute(f'SELECT COUNT(*) FROM "{t}"')
        n = cur.fetchone()[0]
        ok = n == exp
        all_ok = all_ok and ok
        print(f'{t}: {n} rows (expected {exp}) {"✓" if ok else "✗"}')

    # reference integrity
    cur.execute('SELECT "sourceDataset", "sourceRecord", "signalsJson", "metaJson" FROM "ReferenceEcg"')
    rows = cur.fetchall()
    bad_shape, bad_meta, by_ds = 0, 0, {}
    for ds, rec, sig, meta in rows:
        by_ds[ds] = by_ds.get(ds, 0) + 1
        leads = json.loads(sig)
        if len(leads) != 12 or any(len(v) != 1000 for v in leads.values()):
            bad_shape += 1
        m = json.loads(meta) if meta else {}
        if not (m.get('citation') and m.get('url') and m.get('license')):
            bad_meta += 1
    print(f'ReferenceEcg by dataset: {by_ds} {"✓" if set(by_ds) == {"PTB-XL", "MIT-BIH", "CPSC"} else "✗"}')
    print(f'signal shapes OK: {len(rows) - bad_shape}/{len(rows)}; citation+url+license: {len(rows) - bad_meta}/{len(rows)}')
    all_ok = all_ok and bad_shape == 0 and bad_meta == 0

    # superclass balance
    cur.execute('SELECT "superclass", COUNT(*) FROM "ReferenceEcg" GROUP BY 1 ORDER BY 1')
    print('superclass distribution:', dict(cur.fetchall()))

    # app data untouched
    after = {}
    for t in APP_TABLES:
        cur.execute(f'SELECT COUNT(*) FROM "{t}"')
        after[t] = cur.fetchone()[0]
    ok = before == after
    all_ok = all_ok and ok
    print(f'app data preserved: {"✓" if ok else f"✗ CHANGED: {before} -> {after}"}')

cur.close()
conn.close()
print('\nALL SQL EXECUTED & VERIFIED ✓' if all_ok else '\nVERIFICATION FAILED ✗')
sys.exit(0 if all_ok else 1)
