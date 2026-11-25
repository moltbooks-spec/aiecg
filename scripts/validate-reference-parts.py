#!/usr/bin/env python3
"""Validate the 8 split ReferenceEcg SQL parts exactly as the user will run them:
  1. Create a throwaway schema with only the ReferenceEcg DDL (their state:
     schema applied, ReferenceEcg table empty).
  2. Execute each part in order; after each, count rows (expect 5/10/.../40).
  3. Verify signal integrity: every row has 12 leads x 1000 samples, and the
     signals match the live database row-for-row (checksum comparison).
  4. Verify every row carries its official citation + URL in metaJson.
  5. Drop the throwaway schema.
"""
import hashlib
import json
import os

import psycopg2

PROJECT = 'uothvfldjafdtljaprfr'
PASSWORD = 'Abood007$$A'
HOST = 'aws-1-eu-west-1.pooler.supabase.com'
DL = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'download')
N_PARTS = 8

DDL = '''CREATE TABLE IF NOT EXISTS "ReferenceEcg" (
  "id" text NOT NULL,
  "sourceDataset" text NOT NULL DEFAULT 'PTB-XL',
  "sourceRecord" text NOT NULL,
  "sourceLabel" text NOT NULL,
  "superclass" text NOT NULL,
  "samplingHz" integer NOT NULL DEFAULT 100,
  "durationS" double precision NOT NULL DEFAULT 10.0,
  "signalsJson" text NOT NULL,
  "metaJson" text,
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("id"),
  CONSTRAINT "ReferenceEcg_sourceDataset_sourceRecord_key" UNIQUE ("sourceDataset", "sourceRecord")
);'''

conn = psycopg2.connect(
    host=HOST, port=5432, user=f'postgres.{PROJECT}', password=PASSWORD,
    dbname='postgres', connect_timeout=10, sslmode='require',
)
conn.autocommit = True
cur = conn.cursor()

TEST = 'aiecg_ref_validate'
cur.execute(f'DROP SCHEMA IF EXISTS {TEST} CASCADE')
cur.execute(f'CREATE SCHEMA {TEST}')
cur.execute(f'SET search_path TO {TEST}')
cur.execute(DDL)
print('throwaway schema ready (ReferenceEcg table empty)')

all_ok = True
for i in range(1, N_PARTS + 1):
    path = os.path.join(DL, f'aiecg-reference-part-{i}-of-{N_PARTS}.sql')
    sql = open(path).read()
    if len(sql.encode()) > 0.98 * 1024 * 1024:
        print(f'part {i}: TOO LARGE ({len(sql.encode()) // 1024} KB) — exceeds editor limit!')
        all_ok = False
        break
    try:
        cur.execute(sql)
    except Exception as e:
        print(f'part {i}: FAILED — {str(e)[:150]}')
        all_ok = False
        break
    # the part ends with SELECT COUNT(*) — fetch it (last statement result not
    # returned by execute; re-query explicitly)
    cur.execute(f'SELECT COUNT(*) FROM {TEST}."ReferenceEcg"')
    n = cur.fetchone()[0]
    expected = i * 5
    ok = n == expected
    all_ok = all_ok and ok
    print(f'part {i}: executed OK, rows now {n} (expected {expected}) {"✓" if ok else "✗"}')

# ---- signal integrity vs live DB ----
if all_ok:
    cur.execute(f'''
        SELECT "sourceRecord", "signalsJson", "metaJson" FROM {TEST}."ReferenceEcg" ORDER BY "sourceRecord"
    ''')
    test_rows = {r[0]: (r[1], r[2]) for r in cur.fetchall()}

    cur.execute('SET search_path TO public')
    cur.execute('SELECT "sourceRecord", "signalsJson", "metaJson" FROM "ReferenceEcg" ORDER BY "sourceRecord"')
    live_rows = {r[0]: (r[1], r[2]) for r in cur.fetchall()}

    assert set(test_rows) == set(live_rows), 'record sets differ!'
    mismatches, bad_shape, bad_meta = 0, 0, 0
    for rec, (sig, meta) in test_rows.items():
        if hashlib.sha256(sig.encode()).hexdigest() != hashlib.sha256(live_rows[rec][0].encode()).hexdigest():
            mismatches += 1
        leads = json.loads(sig)
        if len(leads) != 12 or any(len(v) != 1000 for v in leads.values()):
            bad_shape += 1
        m = json.loads(meta) if meta else {}
        if not m.get('citation') or not m.get('url'):
            bad_meta += 1
    print(f'signal integrity: {len(test_rows)} records compared, {mismatches} mismatches, '
          f'{bad_shape} bad shapes (12 leads x 1000 samples), '
          f'{bad_meta} missing citation/url '
          f'{"✓ PERFECT MATCH" if mismatches == 0 and bad_shape == 0 and bad_meta == 0 else "✗"}')
    all_ok = all_ok and mismatches == 0 and bad_shape == 0 and bad_meta == 0

cur.execute(f'DROP SCHEMA {TEST} CASCADE')
print('throwaway schema dropped')
cur.close()
conn.close()

print('\nALL PARTS VALID ✓' if all_ok else '\nVALIDATION FAILED ✗')
raise SystemExit(0 if all_ok else 1)
