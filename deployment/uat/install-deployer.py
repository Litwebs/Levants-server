#!/usr/bin/env python3
import os
from pathlib import Path
import pwd
import subprocess
import sys

if os.geteuid() != 0 or len(sys.argv) != 3:
    raise SystemExit('Usage: install-deployer.py <deployment-script-directory> <new-public-key-file>')
source = Path(sys.argv[1])
key = Path(sys.argv[2]).read_text().strip()
if not key.startswith('ssh-ed25519 ') or '\n' in key:
    raise SystemExit('Expected a dedicated ed25519 public key')
home = Path('/var/lib/levants-uat-deploy')
for path in [home, Path('/etc/sudoers.d/levants-uat-deploy'),
             Path('/usr/local/sbin/levants-uat-deploy'), Path('/usr/local/sbin/levants-uat-verify'), Path('/usr/local/sbin/levants-uat-ssh')]:
    if path.exists(): raise SystemExit('UAT deployment target already exists; refusing overwrite')
try:
    pwd.getpwnam('levants-uat-deploy')
    raise SystemExit('UAT deploy account already exists')
except KeyError:
    pass
subprocess.run(['useradd', '--system', '--user-group', '--no-create-home', '--home-dir', str(home),
                '--shell', '/bin/sh', 'levants-uat-deploy'], check=True)
home.mkdir(mode=0o755)
(home/'.ssh').mkdir(mode=0o755)
authorized = home/'.ssh/authorized_keys'
authorized.write_text('restrict,command="/usr/local/sbin/levants-uat-ssh" '+key+'\n')
os.chmod(authorized, 0o644)
for original, target in [('deploy.py', '/usr/local/sbin/levants-uat-deploy'), ('verify.py', '/usr/local/sbin/levants-uat-verify'), ('ssh-entry.py', '/usr/local/sbin/levants-uat-ssh')]:
    path = Path(target)
    path.write_bytes((source/original).read_bytes())
    os.chmod(path, 0o755)
sudoers = Path('/etc/sudoers.d/levants-uat-deploy')
sudoers.write_text('levants-uat-deploy ALL=(root) NOPASSWD: /usr/local/sbin/levants-uat-deploy *, /usr/local/sbin/levants-uat-verify *\n')
os.chmod(sudoers, 0o440)
subprocess.run(['visudo', '-cf', str(sudoers)], check=True)
print('Dedicated forced-command UAT deployment account installed; no general shell or sudo access through its SSH key.')
