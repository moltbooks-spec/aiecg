#!/usr/bin/env python3
"""
Split the ReferenceEcg seed section (40 large signal INSERTs, ~3 MB total)
into small SQL files that fit the Supabase SQL Editor limit (0.98 MB per query).

Reads the INSERT lines from download/aiecg-schema.sql and writes
download/aiecg-reference-part-N-of-M.sql — run them in order in the SQL Editor.

Each part:
  - is ~450 KB (well under the 0.98 MB editor limit)
  - keeps ON CONFLICT DO NOTHING so re-running is safe
  - ends with a SELECT COUNT(*) so the editor shows the growing row count
"""
import os
import re

DL = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'download')
SRC = os.path.join(DL, 'aiecg-schema.sql')
ROWS_PER_PART = 5  # 5 x ~90KB = ~450KB per part

with open(SRC) as f:
    lines = f.readlines()

# extract the ReferenceEcg INSERT lines
inserts = [l.rstrip('\n') for l in lines if l.startswith('INSERT INTO "ReferenceEcg"')]
assert len(inserts) == 40, f'expected 40 ReferenceEcg inserts, found {len(inserts)}'

# pull the record name from each insert for readable headers
rec_re = re.compile(r"'(records100/[^']+|mitdb/[^']+|cpsc2021/[^']+)'")

# remove any stale parts from a previous run
for old in sorted(os.listdir(DL)):
    if re.fullmatch(r'aiecg-reference-part-\d+-of-\d+\.sql', old):
        os.remove(os.path.join(DL, old))
        print(f'removed stale {old}')

n_parts = (len(inserts) + ROWS_PER_PART - 1) // ROWS_PER_PART
written = []
for i in range(n_parts):
    chunk = inserts[i * ROWS_PER_PART:(i + 1) * ROWS_PER_PART]
    first_rec = rec_re.search(chunk[0]).group(1).split('/')[-1]
    last_rec = rec_re.search(chunk[-1]).group(1).split('/')[-1]
    header = (
        f'-- ============================================================\n'
        f'-- AIECG reference ECG signals — part {i + 1} of {n_parts}\n'
        f'-- Verified PhysioNet sources: PTB-XL v1.0.3, MIT-BIH Arrhythmia DB,\n'
        f'-- CPSC 2021 ({len(chunk)} records: {first_rec} .. {last_rec})\n'
        f'-- Every row carries its official citation + URL in "metaJson".\n'
        f'-- Run this in the Supabase SQL Editor (size {sum(len(c) for c in chunk) // 1024} KB < 0.98 MB limit)\n'
        f'-- Safe to re-run: ON CONFLICT DO NOTHING\n'
        f'-- ============================================================\n'
    )
    body = '\n'.join(chunk)
    verify = f'\n-- verification: total reference ECGs now in the database\nSELECT COUNT(*) AS reference_ecg_total, COUNT(DISTINCT "sourceDataset") AS datasets FROM "ReferenceEcg";\n'
    out = header + '\n' + body + '\n' + verify
    path = os.path.join(DL, f'aiecg-reference-part-{i + 1}-of-{n_parts}.sql')
    with open(path, 'w') as f:
        f.write(out)
    written.append(path)
    print(f'wrote {path}: {os.path.getsize(path) // 1024} KB, {len(chunk)} records')

print(f'\n{len(written)} parts written, total {sum(os.path.getsize(p) for p in written) // 1024} KB')
