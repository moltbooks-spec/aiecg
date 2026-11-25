#!/usr/bin/env python3
"""Verify Supabase connection, inspect existing objects, and create the app schema."""
import psycopg2

PROJECT = 'uothvfldjafdtljaprfr'
PASSWORD = 'Abood007$$A'
HOST = 'aws-1-eu-west-1.pooler.supabase.com'

conn = psycopg2.connect(
    host=HOST, port=5432, user=f'postgres.{PROJECT}', password=PASSWORD,
    dbname='postgres', connect_timeout=10, sslmode='require',
)
conn.autocommit = True
cur = conn.cursor()

cur.execute("SELECT current_database(), current_user, version()")
row = cur.fetchone()
print('connected:', row[0], '/', row[1])
print('server:', row[2][:60])

# existing user tables (excluding supabase/platform schemas)
cur.execute("""
    SELECT table_schema, table_name
    FROM information_schema.tables
    WHERE table_type = 'BASE TABLE'
      AND table_schema NOT IN ('pg_catalog', 'information_schema', 'supabase_functions',
                               'supabase_storage', 'graphql_public', 'net', 'cron',
                               'auth', 'storage', 'vault', 'extensions', 'pgsodium',
                               'realtime', 'vault')
    ORDER BY 1, 2
""")
tables = cur.fetchall()
print(f'\nexisting app tables: {len(tables)}')
for s, t in tables[:30]:
    print(f'  {s}.{t}')

cur.close()
conn.close()
print('\nOK')
