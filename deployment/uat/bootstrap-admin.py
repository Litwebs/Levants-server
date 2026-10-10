#!/usr/bin/env python3
"""Seed a synthetic UAT administrator; never prints its generated password."""
import json
import os
from pathlib import Path
import secrets
import subprocess

if os.geteuid() != 0: raise SystemExit('Run as root')
login = Path('/etc/levants-uat/initial-admin.json')
seed = Path('/etc/levants-uat/admin-seed.env')
if login.exists() or seed.exists(): raise SystemExit('UAT admin bootstrap already exists; refusing to reset credentials')
values = {'email': 'admin@uat.example.invalid', 'password': secrets.token_urlsafe(32)}
for path, content in [(login, json.dumps(values)), (seed,
        'ADMIN_EMAIL='+values['email']+'\nADMIN_NAME="UAT Administrator"\nADMIN_PASSWORD='+values['password']+'\n')]:
    with path.open('x') as out: out.write(content)
    os.chmod(path, 0o600)
result = subprocess.run(['systemd-run', '--quiet', '--wait', '--collect', '--unit=levants-uat-admin-bootstrap',
    '-p', 'User=levants-uat', '-p', 'Group=levants-uat',
    '-p', 'WorkingDirectory=/srv/levants-uat/current/server',
    '-p', 'EnvironmentFile=/etc/levants-uat/api.env', '-p', 'EnvironmentFile=/etc/levants-uat/admin-seed.env',
    '-p', 'MemoryMax=512M', '-p', 'CPUQuota=100%', '-p', 'NoNewPrivileges=true',
    '-p', 'ProtectHome=true', '-p', 'ProtectSystem=strict',
    '-p', 'IPAddressDeny=any', '-p', 'IPAddressAllow=localhost',
    '/usr/bin/node', 'scripts/seedAdmin.js'], capture_output=True)
seed.unlink()
if result.returncode: raise SystemExit('UAT admin seed failed; output withheld. Credential file retained for recovery.')
print('Synthetic UAT administrator seeded; initial login stored in /etc/levants-uat/initial-admin.json (root only).')
