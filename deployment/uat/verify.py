#!/usr/bin/env python3
"""Run only the current immutable UAT release's provider checks, never as root."""
import fcntl
import json
import os
from pathlib import Path
import re
import subprocess
import sys

if os.geteuid() != 0 or len(sys.argv) != 2 or not re.fullmatch('[0-9a-f]{40}', sys.argv[1]):
    raise SystemExit('Expected an immutable UAT commit SHA')
sha = sys.argv[1]
lock = open('/run/lock/levants-uat-deploy.lock', 'w')
fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
release = Path('/srv/levants-uat/releases') / sha
if Path('/srv/levants-uat/current').resolve() != release or not (release/'server/scripts/uatProviders.cjs').is_file():
    raise SystemExit('Only the current UAT release can be verified')
args = ['systemd-run', '--quiet', '--wait', '--collect', '--pipe',
        '--unit=levants-uat-verify-'+sha[:12],
        '-p', 'User=levants-uat', '-p', 'Group=levants-uat',
        '-p', 'WorkingDirectory='+str(release/'server'),
        '-p', 'EnvironmentFile=/etc/levants-uat/api.env',
        '-p', 'Environment=RELEASE_SHA='+sha,
        '-p', 'MemoryMax=384M', '-p', 'CPUQuota=50%', '-p', 'CPUWeight=10',
        '-p', 'RuntimeMaxSec=240', '-p', 'NoNewPrivileges=true',
        '-p', 'ProtectHome=true', '-p', 'ProtectSystem=strict', '-p', 'PrivateTmp=true',
        '-p', 'InaccessiblePaths=/var/lib/mongodb /var/lib/levants-uat-mongodb',
        '-p', 'IPAddressDeny=any', '-p', 'IPAddressAllow=localhost']
# Root-owned provider allowlists are the same as the actual UAT API's rules.
for path in sorted(Path('/etc/systemd/system/levants-uat-api.service.d').glob('*.conf')):
    for line in path.read_text().splitlines():
        if line.startswith('IPAddressAllow=') and line != 'IPAddressAllow=':
            args.extend(['-p', line])
result = subprocess.run(args + ['/usr/bin/node', str(release/'server/scripts/uatProviders.cjs')],
                        capture_output=True, text=True, timeout=260)
try:
    report = json.loads(result.stdout)
    assert report['release'] == sha and isinstance(report['checks'], list)
    assert Path('/srv/levants-uat/current').resolve() == release
except Exception:
    raise SystemExit('UAT integration verification failed; diagnostic output withheld to protect credentials') from None
print(json.dumps(report))
raise SystemExit(0 if result.returncode == 0 and report.get('success') is True else 1)
