#!/usr/bin/env python3
"""Extract the real PTB-XL scp_statements.csv into the TypeScript knowledge base,
merging official codes/labels with our reading hints, preserving file header."""
import csv
import json

SRC = 'scp_statements.csv'
OUT = '/home/z/my-project/data/ecg-scp-codes.json'

entries = []
with open(SRC, newline='', encoding='utf-8') as f:
    rdr = csv.DictReader(f)
    for row in rdr:
        code = (row.get('') or row.get('code') or '').strip()  # index column has no header name
        label = (row.get('description') or '').strip()
        if not code or not label:
            continue
        entries.append({
            'code': int(float(code)) if code.replace('.', '').isdigit() else code,
            'label': label,
            'diagnosticClass': (row.get('diagnostic_class') or '').strip() or None,
            'diagnostic': (row.get('diagnostic') or '').strip() == '1',
            'form': (row.get('form') or '').strip() or None,
            'rhythm': (row.get('rhythm') or '').strip() or None,
        })

with open(OUT, 'w', encoding='utf-8') as f:
    json.dump({'source': 'PTB-XL v1.0.3 scp_statements.csv (PhysioNet)',
               'count': len(entries), 'entries': entries}, f, indent=1, ensure_ascii=False)

print(f'wrote {len(entries)} SCP entries to {OUT}')
# show a few key ones
for e in entries[:3]:
    print(' ', e['code'], '-', e['label'])
classes = {}
for e in entries:
    if e['diagnosticClass']:
        classes[e['diagnosticClass']] = classes.get(e['diagnosticClass'], 0) + 1
print('diagnostic classes:', classes)
