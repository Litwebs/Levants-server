#!/usr/bin/env python3
"""Enable only the dedicated UAT hostname using an existing ACME account."""
import os
from pathlib import Path
import socket
import subprocess

DOMAIN = 'uat-api.levantsdairy.co.uk'
SITE = Path('/etc/nginx/sites-available')/DOMAIN
LINK = Path('/etc/nginx/sites-enabled')/DOMAIN
WEBROOT = Path('/var/lib/levants-uat-acme')
CONFIG = Path('/etc/levants-uat')
template = Path(__file__).with_name('nginx-https.conf').read_text()

def run(*args): subprocess.run(args, check=True)

if os.geteuid() != 0: raise SystemExit('Run as root')
addresses = {result[4][0] for result in socket.getaddrinfo(DOMAIN, 443)}
if addresses != {'87.106.76.170'}: raise SystemExit('UAT DNS must resolve only to this VPS')
if SITE.exists() or LINK.exists() or LINK.is_symlink(): raise SystemExit('UAT site exists; refusing overwrite')
if not (CONFIG/'api.env').is_file(): raise SystemExit('UAT backend is not provisioned')
WEBROOT.mkdir(mode=0o755)
challenge = '''server {
    listen 80;
    server_name uat-api.levantsdairy.co.uk;
    location /.well-known/acme-challenge/ { root /var/lib/levants-uat-acme; }
    location / { return 403; }
}
'''
SITE.write_text(challenge)
LINK.symlink_to(SITE)
try:
    run('nginx', '-t')
except Exception:
    LINK.unlink()
    raise
run('systemctl', 'reload', 'nginx')
run('certbot', 'certonly', '--config', '/dev/null', '--webroot', '-w', str(WEBROOT),
    '-d', DOMAIN, '--cert-name', DOMAIN, '--non-interactive', '--no-directory-hooks',
    '--server', 'https://acme-v02.api.letsencrypt.org/directory')
SITE.write_text(template)
try:
    run('nginx', '-t')
except Exception:
    SITE.write_text(challenge)
    raise
run('systemctl', 'reload', 'nginx')
hook = Path('/etc/letsencrypt/renewal-hooks/deploy/levants-uat-reload')
with hook.open('x') as out:
    out.write('''#!/bin/sh
set -eu
if [ "${RENEWED_LINEAGE:-}" = "/etc/letsencrypt/live/uat-api.levantsdairy.co.uk" ]; then
  /usr/sbin/nginx -t
  /usr/bin/systemctl reload nginx
fi
''')
os.chmod(hook, 0o755)
print('UAT HTTPS enabled; access uses normal Levants application authentication.')
