#!/usr/bin/env python3
"""Export the full AIECG Supabase schema (DDL) + seed data to a SQL file
the user can run on any fresh Postgres/Supabase project.

- DDL is reconstructed from information_schema (tables, columns, types,
  defaults, not-null, PK/unique indexes).
- Data: full INSERTs for knowledge tables (ScpCode, LeadCriterion, ModelVersion)
  and LearningRun; ReferenceEcg signals are large — included but the file also
  works without them (they can be re-seeded via scripts/seed-knowledge.py).
"""
import os

import psycopg2
import psycopg2.extras

PROJECT = 'uothvfldjafdtljaprfr'
PASSWORD = 'Abood007$$A'
HOST = 'aws-1-eu-west-1.pooler.supabase.com'

conn = psycopg2.connect(
    host=HOST, port=5432, user=f'postgres.{PROJECT}', password=PASSWORD,
    dbname='postgres', connect_timeout=10, sslmode='require',
)
cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

APP_TABLES = [
    'User', 'Session', 'EcgCase', 'ChatMessage', 'DoctorFeedback',
    'ScpCode', 'LeadCriterion', 'ReferenceEcg', 'ModelVersion',
    'LearningSample', 'LearningRun',
]

out = []
w = out.append

w('-- ============================================================')
w('-- AIECG database schema + seed data (PostgreSQL 15+ / Supabase)')
w('-- Generated from the live project. Run on a fresh database:')
w('--   psql "$DATABASE_URL" -f aiecg-schema.sql')
w('-- ============================================================')
w('')
w('BEGIN;')
w('')

# ---------------------------------------------------------------- DDL per table
for table in APP_TABLES:
    cur.execute("""
        SELECT column_name, data_type, udt_name, column_default, is_nullable,
               character_maximum_length, numeric_precision, numeric_scale
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = %s
        ORDER BY ordinal_position
    """, (table,))
    cols = cur.fetchall()
    if not cols:
        continue

    w(f'-- ------------------------------------------------------------ {table}')
    w(f'CREATE TABLE IF NOT EXISTS "{table}" (')

    col_defs = []
    for c in cols:
        name = c['column_name']
        t = c['udt_name']
        # normalize to standard SQL type names
        TYPE_MAP = {
            'int4': 'INTEGER', 'int2': 'SMALLINT', 'int8': 'BIGINT',
            'float4': 'REAL', 'float8': 'DOUBLE PRECISION',
            'bool': 'BOOLEAN',
        }
        if t in TYPE_MAP:
            t = TYPE_MAP[t]
        elif t == 'varchar':
            t = f'character varying({c["character_maximum_length"]})'
        elif t.startswith('timestamp'):
            t = 'timestamp(3)' if 'timestamp' in c['data_type'] else t
        line = f'  "{name}" {t}'
        if c['is_nullable'] == 'NO':
            line += ' NOT NULL'
        if c['column_default']:
            d = c['column_default']
            if '::text' in d:
                d = d.split('::text')[0] + ''
            line += f' DEFAULT {d}'
        col_defs.append(line)

    # primary key / unique from indexes
    cur.execute("""
        SELECT i.relname, ix.indisprimary, ix.indisunique, ix.indkey
        FROM pg_class t
        JOIN pg_index ix ON t.oid = ix.indrelid
        JOIN pg_class i ON i.oid = ix.indexrelid
        WHERE t.relname = %s AND t.relkind = 'r'
          AND (ix.indisprimary OR ix.indisunique)
    """, (table,))
    for con in cur.fetchall():
        attnums = [int(x) for x in con['indkey'].split()]
        names = []
        for att in attnums:
            cur.execute(
                'SELECT attname FROM pg_attribute WHERE attrelid = %s::regclass AND attnum = %s',
                (f'"{table}"', att),
            )
            names.append(cur.fetchone()['attname'])
        collist = ', '.join(f'"{n}"' for n in names)
        if con['indisprimary']:
            col_defs.append(f'  PRIMARY KEY ({collist})')
        elif con['indisunique']:
            col_defs.append(f'  CONSTRAINT "{con["relname"]}" UNIQUE ({collist})')

    w(',\n'.join(col_defs))
    w(');')
    w('')

    # plain (non-unique) indexes
    cur.execute("""
        SELECT i.relname, ix.indkey
        FROM pg_class t
        JOIN pg_index ix ON t.oid = ix.indrelid
        JOIN pg_class i ON i.oid = ix.indexrelid
        WHERE t.relname = %s AND t.relkind = 'r' AND NOT ix.indisprimary AND NOT ix.indisunique
    """, (table,))
    for idx in cur.fetchall():
        attnums = [int(x) for x in idx['indkey'].split()]
        names = []
        for att in attnums:
            cur.execute(
                'SELECT attname FROM pg_attribute WHERE attrelid = %s::regclass AND attnum = %s',
                (f'"{table}"', att),
            )
            names.append(cur.fetchone()['attname'])
        collist = ', '.join(f'"{n}"' for n in names)
        w(f'CREATE INDEX IF NOT EXISTS "{idx["relname"]}" ON "{table}" ({collist});')
    w('')

# ---------------------------------------------------------------- data export

def esc(v):
    if v is None:
        return 'NULL'
    if isinstance(v, bool):
        return 'true' if v else 'false'
    if isinstance(v, (int, float)):
        return str(v)
    s = str(v).replace("'", "''")
    return f"'{s}'"


def export_table(table, order_by, where=''):
    cur.execute(f'SELECT * FROM "{table}" {where} ORDER BY {order_by}')
    rows = cur.fetchall()
    if not rows:
        w(f'-- {table}: no rows')
        w('')
        return 0
    cols = list(rows[0].keys())
    w(f'-- {table}: {len(rows)} rows')
    for r in rows:
        vals = ', '.join(esc(r[c]) for c in cols)
        collist = ', '.join(f'"{c}"' for c in cols)
        w(f'INSERT INTO "{table}" ({collist}) VALUES ({vals}) ON CONFLICT DO NOTHING;')
    w('')
    return len(rows)


w('-- ============================================================')
w('-- SEED DATA (knowledge base + model registry + learning runs)')
w('-- ============================================================')
w('')
n_scp = export_table('ScpCode', '"id"')
n_crit = export_table('LeadCriterion', '"lead", "criterion"')
n_model = export_table('ModelVersion', '"version"')
n_runs = export_table('LearningRun', '"startedAt"')
# ReferenceEcg: include full signals so a fresh DB has the same knowledge
n_ref = export_table('ReferenceEcg', '"sourceRecord"')

w('COMMIT;')
w('')
w('-- Done.')

sql = '\n'.join(out)
dst = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'download', 'aiecg-schema.sql')
with open(dst, 'w') as f:
    f.write(sql)
print(f'wrote {dst}: {len(sql)} bytes')
print(f'ScpCode={n_scp} LeadCriterion={n_crit} ModelVersion={n_model} LearningRun={n_runs} ReferenceEcg={n_ref}')

cur.close()
conn.close()
