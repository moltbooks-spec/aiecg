#!/usr/bin/env python3
"""Test connectivity to Supabase Postgres: direct IPv6 host, then regional poolers."""
import socket
import ssl
import sys
import psycopg2

PROJECT = 'uothvfldjafdtljaprfr'
PASSWORD = 'Abood007$$A'
USER = 'postgres'
DB = 'postgres'

targets = [
    ('direct  (db.<ref>.supabase.co:5432)', f'db.{PROJECT}.supabase.co', 5432),
    ('pooler  (aws-0-eu-central-1:5432)', 'aws-0-eu-central-1.pooler.supabase.com', 5432),
    ('pooler  (aws-0-eu-west-1:5432)', 'aws-0-eu-west-1.pooler.supabase.com', 5432),
    ('pooler  (aws-0-us-east-1:5432)', 'aws-0-us-east-1.pooler.supabase.com', 5432),
]

for label, host, port in targets:
    print(f'--- {label} ---')
    # TCP
    try:
        infos = socket.getaddrinfo(host, port, proto=socket.IPPROTO_TCP)
        fams = {i[0] for i in infos}
        print(f'  dns: families={fams}')
        conn = socket.create_connection((host, port), timeout=8)
        conn.close()
        print('  tcp: OK')
    except Exception as e:
        print(f'  tcp: FAIL {type(e).__name__}: {e}')
        continue
    # Postgres login (direct host uses 'postgres', pooler uses 'postgres.<ref>')
    for pg_user in ([USER] if 'direct' in label else [f'{USER}.{PROJECT}']):
        try:
            conn = psycopg2.connect(
                host=host, port=port, user=pg_user, password=PASSWORD, dbname=DB,
                connect_timeout=8, sslmode='require',
            )
            cur = conn.cursor()
            cur.execute('SELECT current_database(), current_user, version()')
            row = cur.fetchone()
            print(f'  pg login as {pg_user}: OK -> {row[0]} / {row[1]} / {str(row[2])[:40]}')
            cur.close()
            conn.close()
            print(f'\nWORKING TARGET: {host}:{port} user={pg_user}')
            sys.exit(0)
        except Exception as e:
            print(f'  pg login as {pg_user}: FAIL {type(e).__name__}: {str(e)[:120]}')

print('\nNo working target found')
sys.exit(1)
