#!/usr/bin/env python3
"""One-time, explicitly approved UAT Google DNS-policy refresh; no production writes."""
import fcntl
import ipaddress
import json
import os
from pathlib import Path
import re
import socket
import stat
import subprocess
import tempfile
import time
import urllib.request

POLICY = Path('/etc/systemd/system/levants-uat-api.service.d/google.conf')
BACKUPS = Path('/etc/levants-uat')
PRODUCTION = Path('/root/LWS-Scripts/Levants-server')
EXPECTED_PRODUCTION = '144badd63cb5263ad8eb89ce4f353816515f0fd4'
UNIT = 'levants-uat-api.service'
HOSTS = ('maps.googleapis.com', 'oauth2.googleapis.com', 'routeoptimization.googleapis.com')


def command(*args):
    return subprocess.check_output(args, text=True, stderr=subprocess.PIPE, timeout=30).strip()


def production_processes(proc_root=Path('/proc'), working_directory=PRODUCTION / 'server'):
    processes = []
    for entry in proc_root.iterdir():
        if not entry.name.isdigit(): continue
        try:
            if (entry / 'exe').resolve().name != 'node': continue
            if (entry / 'cwd').resolve() not in (working_directory, working_directory.parent): continue
            # PID and kernel start-time identify a running process without
            # reading command lines or environment variables containing secrets.
            fields = (entry / 'stat').read_text().rsplit(') ', 1)[1].split()
            processes.append((int(entry.name), int(fields[19])))
        except (OSError, ValueError, IndexError): continue
    if not processes:
        raise ValueError('Could not identify the existing production server processes')
    return sorted(processes)


def production_health():
    with urllib.request.urlopen('https://api.levantsdairy.co.uk/health', timeout=10) as response:
        if response.status != 200:
            raise ValueError('Production health is not successful')


def resolve_policy(resolver=socket.getaddrinfo):
    addresses = set()
    for host in HOSTS:
        resolved = {row[4][0] for row in resolver(host, 443, type=socket.SOCK_STREAM)}
        if not resolved or any(not ipaddress.ip_address(value).is_global for value in resolved):
            raise ValueError('Google resolution is missing or not public')
        addresses.update(resolved)
    return ('[Service]\n# Explicitly approved UAT Google DNS snapshot refresh.\n'
            'IPAddressAllow=' + ' '.join(sorted(addresses)) + '\n'), len(addresses)


def protected_policy(path):
    if path.is_symlink() or path.resolve() != path:
        raise ValueError('UAT policy path must not be redirected')
    info = path.stat()
    if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or info.st_mode & 0o022:
        raise ValueError('UAT Google policy must be protected and root-owned')
    source = path.read_text()
    if '[Service]' not in source or 'IPAddressAllow=' not in source:
        raise ValueError('Expected existing Google service policy')
    return source, stat.S_IMODE(info.st_mode), info.st_gid


def replace_policy(path, source, mode, group):
    fd, staged = tempfile.mkstemp(prefix='.google-network-', dir=path.parent)
    try:
        os.fchmod(fd, mode)
        os.fchown(fd, 0, group)
        with os.fdopen(fd, 'w') as stream:
            stream.write(source)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(staged, path)
    finally:
        if os.path.exists(staged): os.unlink(staged)


def health():
    with urllib.request.urlopen('http://127.0.0.1:5002/health', timeout=3) as response:
        data = json.load(response)['data']
    if data.get('deploymentEnvironment') != 'uat':
        raise ValueError('Expected isolated UAT API')
    release = data.get('release', '')
    if not isinstance(release, str) or not re.fullmatch('[0-9a-f]{40}', release):
        raise ValueError('Expected immutable UAT release identity')
    return release


def apply_refresh(path, source, mode, group, release, *, writer=replace_policy,
                  run=command, probe=health, pause=time.sleep):
    original = path.read_text()
    try:
        writer(path, source, mode, group)
        run('systemctl', 'daemon-reload')
        run('systemctl', 'restart', UNIT)
        for _ in range(30):
            try:
                if probe() == release: return
            except Exception: pass
            pause(2)
        raise RuntimeError('UAT health or release identity check failed')
    except Exception:
        writer(path, original, mode, group)
        run('systemctl', 'daemon-reload')
        run('systemctl', 'restart', UNIT)
        raise


def main():
    if os.geteuid() != 0:
        raise ValueError('Protected UAT maintenance identity required')
    with open('/run/lock/levants-uat-deploy.lock', 'w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        before = command('git', '-C', str(PRODUCTION), 'rev-parse', 'HEAD')
        if before != EXPECTED_PRODUCTION:
            raise ValueError('Production identity guard failed')
        processes_before = production_processes()
        production_health()
        if command('systemctl', 'show', UNIT, '-p', 'User', '--value') != 'levants-uat':
            raise ValueError('Unexpected UAT service identity')
        original, mode, group = protected_policy(POLICY)
        if BACKUPS.resolve() != BACKUPS or BACKUPS.stat().st_uid != 0:
            raise ValueError('Protected UAT backup location required')
        release = health()
        source, count = resolve_policy()
        # The new policy changes only this service's explicit Google addresses.
        # IPAddressDeny, other providers, credentials, production units and SSH
        # are not edited. Keep a private pre-change copy for operator recovery.
        fd, backup = tempfile.mkstemp(prefix='google-network-before-refresh-', suffix='.conf', dir=BACKUPS)
        with os.fdopen(fd, 'w') as stream:
            os.fchmod(stream.fileno(), 0o600)
            stream.write(original)
        apply_refresh(POLICY, source, mode, group, release)
        after = command('git', '-C', str(PRODUCTION), 'rev-parse', 'HEAD')
        if after != before:
            raise ValueError('Production identity changed during maintenance')
        if production_processes() != processes_before:
            raise ValueError('Production server processes changed during maintenance')
        production_health()
        print(json.dumps({'uatGoogleNetworkRefreshed': True, 'googleAddressCount': count,
                          'uatReleaseUnchanged': release, 'uatHealthVerified': True,
                          'productionHeadUnchanged': before, 'productionRestarted': False,
                          'productionProcessesUnchanged': True, 'productionHealthVerified': True,
                          'databaseWritten': False, 'protectedBackupCreated': True}))


if __name__ == '__main__':
    try: main()
    except Exception as error:
        # Never echo provider/network errors, credentials or environment values.
        print('UAT Google network refresh failed: ' + type(error).__name__)
        raise SystemExit(1)
