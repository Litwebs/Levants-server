#!/usr/bin/env python3
"""Receive a bounded source/build archive on stdin; deploy UAT only."""
import fcntl
import grp
import hashlib
import json
import os
from pathlib import Path
import pwd
import re
import subprocess
import sys
import tarfile
import tempfile
import time
import urllib.request

BASE = Path('/srv/levants-uat')
if os.geteuid() != 0 or len(sys.argv) != 2 or not re.fullmatch('[0-9a-f]{40}', sys.argv[1]):
    raise SystemExit('Expected an immutable UAT commit SHA')
sha = sys.argv[1]
lock = open('/run/lock/levants-uat-deploy.lock', 'w')
fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
if not (BASE/'PROVISIONED').is_file():
    raise SystemExit('UAT infrastructure is not provisioned')
previous = os.readlink(BASE/'current') if (BASE/'current').is_symlink() else None
destination = BASE/'releases'/sha
if destination.exists():
    raise SystemExit('Release already exists; immutable releases cannot be overwritten')

def run(*args):
    subprocess.run(args, check=True)

def switch(target):
    link = BASE/'current.next'
    if link.is_symlink(): link.unlink()
    link.symlink_to(target)
    os.replace(link, BASE/'current')

with tempfile.TemporaryDirectory(prefix='levants-uat-build-', dir='/var/tmp') as tmp:
    work = Path(tmp)
    archive = work/'release.tar.gz'
    size = 0
    with archive.open('wb') as output:
        while True:
            chunk = sys.stdin.buffer.read(1024 * 1024)
            if not chunk: break
            size += len(chunk)
            if size > 80 * 1024 * 1024: raise SystemExit('Archive exceeds UAT limit')
            output.write(chunk)
    source = work/'source'
    source.mkdir()
    seen = set()
    expanded = 0
    with tarfile.open(archive, 'r:gz') as bundle:
        members = bundle.getmembers()
        if len(members) > 10000: raise SystemExit('Too many archive entries')
        for member in members:
            name = member.name
            parts = Path(name).parts
            if name in seen: raise SystemExit('Duplicate archive path')
            seen.add(name)
            if not parts or Path(name).is_absolute() or '..' in parts:
                raise SystemExit('Unsafe archive path')
            if any(p.startswith('.env') or p in ['.git', 'node_modules'] for p in parts):
                raise SystemExit('Secrets and dependencies must not be included')
            allowed = name == 'release.json' or name.startswith('server/') or name.startswith('client/build/')
            if not allowed or not (member.isfile() or member.isdir()):
                raise SystemExit('Unsupported archive entry')
            expanded += member.size
            if expanded > 250 * 1024 * 1024: raise SystemExit('Expanded archive exceeds UAT limit')
            target = source/name
            if member.isdir():
                target.mkdir(parents=True, exist_ok=True)
            else:
                target.parent.mkdir(parents=True, exist_ok=True)
                with bundle.extractfile(member) as src, target.open('xb') as out:
                    while True:
                        chunk = src.read(1024 * 1024)
                        if not chunk: break
                        out.write(chunk)
    manifest = json.loads((source/'release.json').read_text())
    if manifest.get('sha') != sha or manifest.get('environment') != 'uat':
        raise SystemExit('Release manifest does not match UAT request')
    build_files = {str(p.relative_to(source)): hashlib.sha256(p.read_bytes()).hexdigest()
                   for p in (source/'client/build').rglob('*') if p.is_file()}
    if manifest.get('frontendSha') != sha or manifest.get('frontendFiles') != build_files:
        raise SystemExit('Admin artifact checksums do not match the release manifest')
    if not (source/'server/config/uatSafety.js').is_file() or not (source/'client/build/index.html').is_file():
        raise SystemExit('UAT safeguards and verified admin build are required')
    build_user = pwd.getpwnam('levants-uat-build')
    os.chown(work, build_user.pw_uid, build_user.pw_gid)
    for root, dirs, files in os.walk(source):
        os.chown(root, build_user.pw_uid, build_user.pw_gid)
        for name in files: os.chown(Path(root)/name, build_user.pw_uid, build_user.pw_gid)
    run('systemd-run', '--quiet', '--wait', '--collect', '--unit=levants-uat-build-'+sha[:12],
        '-p', 'User=levants-uat-build', '-p', 'Group=levants-uat-build',
        '-p', 'MemoryMax=768M', '-p', 'CPUQuota=100%', '-p', 'CPUWeight=10',
        '-p', 'NoNewPrivileges=true', '-p', 'ProtectHome=true', '-p', 'ProtectSystem=strict',
        '-p', 'InaccessiblePaths=/etc/levants-uat /var/lib/mongodb /var/lib/levants-uat-mongodb',
        '-p', 'ReadWritePaths='+str(work), '-p', 'WorkingDirectory='+str(source/'server'),
        '-p', 'Environment=HOME='+str(work), '-p', 'Environment=npm_config_cache='+str(work/'.npm'),
        '/usr/bin/npm', 'ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund')
    (source/'release.env').write_text('RELEASE_SHA='+sha+'\n')
    # Build identity is no longer allowed to change the release after publication.
    group = grp.getgrnam('levants-uat').gr_gid
    for root, dirs, files in os.walk(source):
        os.chown(root, 0, group)
        os.chmod(root, 0o750)
        for name in files:
            item = Path(root)/name
            if item.is_symlink():
                os.lchown(item, 0, group)
            else:
                executable = item.stat().st_mode & 0o111
                os.chown(item, 0, group)
                os.chmod(item, 0o750 if executable else 0o640)
    os.rename(source, destination)
    switch('releases/'+sha)
    try:
        run('systemctl', 'restart', 'levants-uat-api.service')
        healthy = False
        for _ in range(30):
            try:
                with urllib.request.urlopen('http://127.0.0.1:5002/health', timeout=3) as response:
                    data = json.load(response).get('data', {})
                if data.get('deploymentEnvironment') == 'uat' and data.get('release') == sha:
                    healthy = True
                    break
            except (OSError, ValueError):
                pass
            time.sleep(2)
        if not healthy: raise RuntimeError('UAT release failed its health check')
    except Exception:
        if previous:
            switch(previous)
            run('systemctl', 'restart', 'levants-uat-api.service')
        else:
            run('systemctl', 'stop', 'levants-uat-api.service')
            (BASE/'current').unlink()
        raise
    run('systemctl', 'enable', 'levants-uat-api.service')
    print('UAT release healthy: '+sha)
