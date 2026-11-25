#!/usr/bin/env python3
"""Scan all known Supabase pooler regions to find the project's actual region."""
import socket
import psycopg2

PROJECT = 'uothvfldjafdtljaprfr'
PASSWORD = 'Abood007$$A'

REGIONS = [
    'aws-0-us-west-1', 'aws-0-us-east-2', 'aws-0-us-west-2', 'aws-0-ca-central-1',
    'aws-0-eu-north-1', 'aws-0-eu-south-1', 'aws-0-eu-west-2', 'aws-0-eu-west-3',
    'aws-0-eu-central-1', 'aws-0-eu-west-1', 'aws-0-us-east-1',
    'aws-0-ap-southeast-1', 'aws-0-ap-southeast-2', 'aws-0-ap-northeast-1',
    'aws-0-ap-northeast-2', 'aws-0-ap-south-1', 'aws-0-sa-east-1',
    'aws-1-eu-central-1', 'aws-1-eu-west-1', 'aws-1-us-east-1', 'aws-1-us-west-2',
    'aws-1-ap-southeast-1', 'aws-1-ap-northeast-1',
]

for region in REGIONS:
    host = f'{region}.pooler.supabase.com'
    try:
        conn = psycopg2.connect(
            host=host, port=5432, user=f'postgres.{PROJECT}', password=PASSWORD,
            dbname='postgres', connect_timeout=6, sslmode='require',
        )
        cur = conn.cursor()
        cur.execute('SELECT current_database()')
        print(f'FOUND: {host} -> {cur.fetchone()[0]}')
        cur.close()
        conn.close()
        import sys
        sys.exit(0)
    except psycopg2.OperationalError as e:
        msg = str(e)
        # ENOTFOUND = region exists but project not there; DNS/getaddrinfo fail = no such region
        short = 'not-this-region' if 'ENOTFOUND' in msg else msg.split('\n')[0][:60]
        print(f'{region}: {short}')
    except Exception as e:
        print(f'{region}: {type(e).__name__} {str(e)[:60]}')

print('Project region not found in scanned poolers')
