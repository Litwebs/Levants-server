#!/usr/bin/env python3
"""Add isolated UAT services. Never reads production configuration or data."""
import base64
import grp
import json
import os
from pathlib import Path
import pwd
import secrets
import subprocess
import time

BASE = Path('/srv/levants-uat')
CONFIG = Path('/etc/levants-uat')

def run(*args):
    subprocess.run(args, check=True)

def write(path, content, mode=0o644, owner='root', group='root'):
    path = Path(path)
    with path.open('x') as handle:
        handle.write(content)
    os.chmod(path, mode)
    os.chown(path, pwd.getpwnam(owner).pw_uid, grp.getgrnam(group).gr_gid)

if os.geteuid() != 0:
    raise SystemExit('Run as root')
targets = [BASE, CONFIG, Path('/var/lib/levants-uat-mongodb'),
           Path('/etc/systemd/system/levants-uat-mongodb.service'),
           Path('/etc/systemd/system/levants-uat-api.service')]
if any(p.exists() for p in targets):
    raise SystemExit('UAT target exists; refusing to overwrite. Inspect the prior provisioning state.')
for name in ['levants-uat', 'levants-uat-db', 'levants-uat-build']:
    try:
        pwd.getpwnam(name)
        raise SystemExit('UAT account already exists; refusing to reuse it')
    except KeyError:
        pass
for name in ['levants-uat', 'levants-uat-db', 'levants-uat-build']:
    run('useradd', '--system', '--user-group', '--no-create-home', '--home-dir',
        str(BASE if name == 'levants-uat' else '/nonexistent'), '--shell', '/usr/sbin/nologin', name)

for p, owner, group, mode in [
    (BASE, 'root', 'levants-uat', 0o750),
    (BASE/'releases', 'root', 'levants-uat', 0o750),
    (BASE/'shared', 'levants-uat', 'levants-uat', 0o700),
    (BASE/'shared/email-outbox', 'levants-uat', 'levants-uat', 0o700),
    (CONFIG, 'root', 'root', 0o755),
    (CONFIG/'mongodb', 'root', 'levants-uat-db', 0o750),
    (Path('/var/lib/levants-uat-mongodb'), 'levants-uat-db', 'levants-uat-db', 0o700),
    (Path('/var/log/levants-uat-mongodb'), 'levants-uat-db', 'levants-uat-db', 0o700),
]:
    p.mkdir()
    os.chmod(p, mode)
    os.chown(p, pwd.getpwnam(owner).pw_uid, grp.getgrnam(group).gr_gid)

admin_password = secrets.token_hex(32)
app_password = secrets.token_hex(32)
write(CONFIG/'mongodb/admin.json', json.dumps({'username': 'levants_uat_admin', 'password': admin_password}), 0o600)
write(CONFIG/'mongodb/keyfile', base64.b64encode(secrets.token_bytes(512)).decode(), 0o400, 'levants-uat-db', 'levants-uat-db')
write(CONFIG/'mongodb/mongod.conf', '''storage:
  dbPath: /var/lib/levants-uat-mongodb
  wiredTiger:
    engineConfig:
      cacheSizeGB: 0.25
systemLog:
  destination: file
  path: /var/log/levants-uat-mongodb/mongod.log
  logAppend: true
net:
  bindIp: 127.0.0.1
  port: 27018
replication:
  replSetName: levants-uat
security:
  authorization: enabled
  keyFile: /etc/levants-uat/mongodb/keyfile
''', 0o640, 'root', 'levants-uat-db')

values = {
    'APP_ENV': 'uat', 'LEVANTS_REQUIRE_UAT': '1', 'NODE_ENV': 'production',
    'PORT': '5002', 'HOST': '127.0.0.1', 'TZ': 'Europe/London',
    'MONGO_URI': f'mongodb://levants_uat_app:{app_password}@127.0.0.1:27018/levants_uat?authSource=levants_uat&replicaSet=levants-uat',
    'EMAIL_TRANSPORT': 'capture', 'UAT_EMAIL_OUTBOX': '/srv/levants-uat/shared/email-outbox',
    'UAT_STORAGE_MODE': 'disabled', 'BACKGROUND_JOBS_ENABLED': 'false',
    'STRIPE_SECRET_KEY': 'sk_test_uat_disabled', 'STRIPE_WEBHOOKS_ENABLED': 'false',
    'STRIPE_DEFAULT_CURRENCY': 'GBP', 'PASSWORD_SALT_ROUNDS': '12',
    'JWT_ACCESS_EXPIRES_IN': '15m', 'JWT_REFRESH_EXPIRES_IN': '7d', 'JWT_2FA_EXPIRES_IN': '10m',
    'BUSINESS_NAME': 'Levants UAT — TEST ONLY', 'BUSINESS_EMAIL': 'uat@example.invalid',
    'BUSINESS_PHONE': '00000000000', 'BUSINESS_ADDRESS': 'UAT synthetic data only',
}
for name in ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET', 'JWT_2FA_SECRET',
             'JWT_CUSTOMER_ACCESS_SECRET', 'JWT_CUSTOMER_REFRESH_SECRET', 'CREDENTIALS_MASTER_KEY']:
    values[name] = secrets.token_hex(32)
for name in ['FRONTEND_URL_PROD', 'FRONTEND_URL_DEV', 'CLIENT_FRONT_URL_PROD', 'CLIENT_FRONT_URL_DEV',
             'CUSTOMER_PORTAL_URL_PROD', 'CUSTOMER_PORTAL_URL_DEV']:
    values[name] = 'https://uat-api.levantsdairy.co.uk'
write(CONFIG/'api.env', ''.join(f'{key}={json.dumps(value, ensure_ascii=False)}\n' for key, value in values.items()), 0o640, 'root', 'levants-uat')

write('/etc/systemd/system/levants-uat-mongodb.service', '''[Unit]
Description=Levants UAT isolated MongoDB
After=network.target

[Service]
User=levants-uat-db
Group=levants-uat-db
ExecStart=/usr/bin/mongod --config /etc/levants-uat/mongodb/mongod.conf
Restart=on-failure
RestartSec=10
MemoryMax=768M
CPUQuota=100%
CPUWeight=10
IOWeight=10
UMask=0077
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
ReadWritePaths=/var/lib/levants-uat-mongodb /var/log/levants-uat-mongodb
InaccessiblePaths=/var/lib/mongodb
LimitNOFILE=64000

[Install]
WantedBy=multi-user.target
''')
write('/etc/systemd/system/levants-uat-api.service', '''[Unit]
Description=Levants UAT backend
After=network.target levants-uat-mongodb.service
Requires=levants-uat-mongodb.service
ConditionPathExists=/srv/levants-uat/current/server/server.js

[Service]
User=levants-uat
Group=levants-uat
WorkingDirectory=/srv/levants-uat/current/server
EnvironmentFile=/etc/levants-uat/api.env
EnvironmentFile=/srv/levants-uat/current/release.env
ExecStart=/usr/bin/node --max-old-space-size=512 server.js
Restart=on-failure
RestartSec=10
TimeoutStopSec=20
MemoryMax=1G
CPUQuota=100%
CPUWeight=10
IOWeight=10
UMask=0077
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
ReadWritePaths=/srv/levants-uat/shared
InaccessiblePaths=/var/lib/mongodb /var/lib/levants-uat-mongodb /etc/levants-uat/mongodb
IPAddressDeny=any
IPAddressAllow=localhost
RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6

[Install]
WantedBy=multi-user.target
''')
run('systemctl', 'daemon-reload')
run('systemctl', 'enable', '--now', 'levants-uat-mongodb.service')

bootstrap = CONFIG/'mongodb/bootstrap.js'
script = '''const admin = db.getSiblingDB('admin');
rs.initiate({_id:'levants-uat', members:[{_id:0, host:'127.0.0.1:27018'}]});
let ready = false;
for (let i=0; i<60; i++) { if (db.hello().isWritablePrimary) { ready=true; break; } sleep(1000); }
if (!ready) throw new Error('UAT primary not ready');
admin.createUser({user:'levants_uat_admin', pwd:ADMIN_PASSWORD, roles:[{role:'root', db:'admin'}]});
if (!admin.auth('levants_uat_admin', ADMIN_PASSWORD)) throw new Error('UAT admin authentication failed');
db.getSiblingDB('levants_uat').createUser({user:'levants_uat_app', pwd:APP_PASSWORD, roles:[{role:'readWrite', db:'levants_uat'}]});
'''.replace('ADMIN_PASSWORD', json.dumps(admin_password)).replace('APP_PASSWORD', json.dumps(app_password))
write(bootstrap, script, 0o600)
for attempt in range(30):
    ready = subprocess.run(['mongosh', '--quiet', '--host', '127.0.0.1', '--port', '27018', '--eval', 'db.adminCommand({ping:1}).ok'], capture_output=True)
    if ready.returncode == 0:
        break
    time.sleep(1)
else:
    raise SystemExit('UAT MongoDB did not become reachable; API remains stopped')
result = subprocess.run(['mongosh', '--quiet', '--host', '127.0.0.1', '--port', '27018', '--file', str(bootstrap)], capture_output=True)
bootstrap.unlink()
if result.returncode:
    raise SystemExit('UAT database bootstrap failed; output withheld to protect newly generated credentials. API remains stopped.')
write(BASE/'PROVISIONED', 'Levants UAT isolated infrastructure v1\n')
print('UAT MongoDB provisioned on localhost:27018; independent credentials generated; API remains stopped.')
