#!/usr/bin/env python3
"""Validate the exported aiecg-schema.sql by executing it inside a throwaway
schema on the live database, counting rows, then dropping the schema."""
import os

import psycopg2

PROJECT = 'uothvfldjafdtljaprfr'
PASSWORD = 'Abood007$$A'
HOST = 'aws-1-eu-west-1.pooler.supabase.com'

SQL_FILE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'download', 'aiecg-schema.sql')

conn = psycopg2.connect(
    host=HOST, port=5432, user=f'postgres.{PROJECT}', password=PASSWORD,
    dbname='postgres', connect_timeout=10, sslmode='require',
)
conn.autocommit = True
cur = conn.cursor()

TEST_SCHEMA = 'aiecg_validate'

# clean slate
cur.execute(f'DROP SCHEMA IF EXISTS {TEST_SCHEMA} CASCADE')
cur.execute(f'CREATE SCHEMA {TEST_SCHEMA}')
cur.execute(f'SET search_path TO {TEST_SCHEMA}, public')

sql = open(SQL_FILE).read()
try:
    cur.execute(sql)
    print('SQL executed OK (BEGIN/COMMIT included)')
except Exception as e:
    print(f'FAILED: {e}')
    cur.execute(f'DROP SCHEMA IF EXISTS {TEST_SCHEMA} CASCADE')
    raise SystemExit(1)

# count rows in the validation schema
for t in ['ScpCode', 'LeadCriterion', 'ReferenceEcg', 'ModelVersion', 'LearningRun']:
    cur.execute(f'SELECT COUNT(*) FROM {TEST_SCHEMA}."{t}"')
    print(f'{t}: {cur.fetchone()[0]} rows')

cur.execute(f'DROP SCHEMA {TEST_SCHEMA} CASCADE')
print('validation schema dropped — file is valid')
cur.close()
conn.close()
