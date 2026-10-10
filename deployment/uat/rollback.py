#!/usr/bin/env python3
"""Root-only UAT rollback to an existing immutable release."""
import fcntl
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time
import urllib.request

base = Path('/srv/levants-uat')
if os.geteuid() != 0 or len(sys.argv) != 2 or not re.fullmatch('[0-9a-f]{40}', sys.argv[1]):
    raise SystemExit('Expected an existing UAT commit SHA')
sha = sys.argv[1]
lock = open('/run/lock/levants-uat-deploy.lock', 'w')
fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
release = base/'releases'/sha
if release.resolve().parent != (base/'releases').resolve():
    raise SystemExit('Invalid release path')
manifest = json.loads((release/'release.json').read_text())
if manifest.get('environment') != 'uat' or manifest.get('sha') != sha:
    raise SystemExit('Target is not a verified UAT release')
previous = os.readlink(base/'current')

def switch(target):
    temp = base/'current.next'
    temp.symlink_to(target)
    os.replace(temp, base/'current')
    subprocess.run(['systemctl', 'restart', 'levants-uat-api.service'], check=True)

switch('releases/'+sha)
try:
    for attempt in range(30):
        try:
            with urllib.request.urlopen('http://127.0.0.1:5002/health', timeout=3) as response:
                data = json.load(response).get('data', {})
            if data.get('deploymentEnvironment') == 'uat' and data.get('release') == sha:
                print('UAT rollback verified: '+sha)
                break
        except (OSError, ValueError):
            pass
        time.sleep(2)
    else:
        raise RuntimeError('UAT rollback failed health verification')
except Exception:
    switch(previous)
    raise
