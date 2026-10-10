#!/usr/bin/env python3
"""Activate only the verified UAT sandbox, restoring UAT config on failure."""
import ipaddress
import json
import os
from pathlib import Path
import subprocess
import time
import urllib.request
import runpy

check = runpy.run_path(str(Path(__file__).with_name('check-stripe.py')))
values = check['values']
base = Path('/srv/levants-uat/current')
if 'UAT accepts sandbox events only' not in (base/'server/controllers/stripe.webhook.controller.js').read_text():
    raise SystemExit('Deploy sandbox-aware UAT code first')
with urllib.request.urlopen('https://stripe.com/files/ips/ips_api.txt', timeout=20) as response:
    addresses = response.read(100000).decode().split()
if not 10 <= len(addresses) <= 1000:
    raise SystemExit('Unexpected Stripe API address list')
for address in addresses:
    if not ipaddress.ip_address(address).is_global:
        raise SystemExit('Stripe list contains a non-public address')
config = Path('/etc/levants-uat/api.env')
dropin = Path('/etc/systemd/system/levants-uat-api.service.d/stripe.conf')
original = config.read_bytes()
old_dropin = dropin.read_bytes() if dropin.exists() else None
backup = Path('/etc/levants-uat/api.before-stripe.env')
if backup.exists():
    raise SystemExit('Activation backup already exists; inspect state before retrying')
fd = os.open(backup, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
with os.fdopen(fd,'wb') as f: f.write(original)
updates = {**values,'UAT_STRIPE_MODE':'test','STRIPE_WEBHOOKS_ENABLED':'true','STRIPE_API_VERSION':'2024-06-20'}
updates = {k:updates[k] for k in ['STRIPE_SECRET_KEY','STRIPE_PUBLISHABLE_KEY','STRIPE_WEBHOOK_SECRET','UAT_STRIPE_MODE','STRIPE_WEBHOOKS_ENABLED','STRIPE_API_VERSION']}
lines = [line for line in original.decode().splitlines() if line.split('=',1)[0] not in updates]
lines += [key+'='+json.dumps(value) for key,value in updates.items()]
def run(*args):
    subprocess.run(args, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
try:
    config.write_text('\n'.join(lines)+'\n')
    dropin.parent.mkdir(mode=0o755,exist_ok=True)
    dropin.write_text('[Service]\n# Official Stripe API IPs; keep default deny and loopback access.\nIPAddressAllow='+' '.join(addresses)+'\n')
    run('systemctl','daemon-reload')
    run('systemctl','restart','levants-uat-api.service')
    for attempt in range(30):
        try:
            with urllib.request.urlopen('http://127.0.0.1:5002/health',timeout=2) as r:
                health=json.load(r)
            if health.get('success') and health['data'].get('deploymentEnvironment')=='uat': break
        except Exception: pass
        time.sleep(1)
    else: raise RuntimeError('UAT did not become healthy')
except Exception:
    config.write_bytes(original)
    if old_dropin is None: dropin.unlink(missing_ok=True)
    else: dropin.write_bytes(old_dropin)
    run('systemctl','daemon-reload')
    run('systemctl','restart','levants-uat-api.service')
    raise SystemExit('Activation failed; previous UAT configuration restored') from None
print(json.dumps({'activated':'stripe-sandbox','allowedStripeAddresses':len(addresses),'uatHealthy':True}))
