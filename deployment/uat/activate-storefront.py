#!/usr/bin/env python3
"""Map UAT-only customer links and CORS to the isolated storefront."""
import json,os,subprocess,time,urllib.request
from pathlib import Path
if os.geteuid()!=0:raise SystemExit('Run as root')
if 'https://uat.levantsdairy.co.uk' not in Path('/srv/levants-uat/current/server/config/uatSafety.js').read_text():raise SystemExit('Deploy storefront-aware UAT safety checks first')
config=Path('/etc/levants-uat/api.env');original=config.read_bytes()
backup=Path('/etc/levants-uat/api.before-storefront.env')
if backup.exists():raise SystemExit('Storefront activation backup exists; refusing overwrite')
fd=os.open(backup,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
with os.fdopen(fd,'wb') as out:out.write(original)
changes={'CLIENT_FRONT_URL_PROD':'https://uat.levantsdairy.co.uk','CUSTOMER_PORTAL_URL_PROD':'https://uat.levantsdairy.co.uk','STRIPE_PAYMENT_METHOD_DOMAINS':'uat.levantsdairy.co.uk,uat-api.levantsdairy.co.uk'}
def run(*args):subprocess.run(args,check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
try:
 lines=[line for line in original.decode().splitlines() if line.split('=',1)[0] not in changes]
 lines.extend(name+'="'+value+'"' for name,value in changes.items())
 config.write_text('\n'.join(lines)+'\n');run('systemctl','restart','levants-uat-api.service')
 for attempt in range(40):
  try:
   with urllib.request.urlopen('http://127.0.0.1:5002/health',timeout=2) as response:health=json.load(response)
   if health.get('success') and health.get('data',{}).get('deploymentEnvironment')=='uat':break
  except Exception:pass
  time.sleep(1)
 else:raise RuntimeError('UAT did not become healthy')
 request=urllib.request.Request('http://127.0.0.1:5002/api/portal/auth/me',method='OPTIONS',headers={'Origin':'https://uat.levantsdairy.co.uk','Access-Control-Request-Method':'GET'})
 with urllib.request.urlopen(request,timeout=5) as response:
  if response.headers.get('Access-Control-Allow-Origin')!='https://uat.levantsdairy.co.uk' or response.headers.get('Access-Control-Allow-Credentials')!='true':raise RuntimeError('UAT CORS mapping failed')
except Exception:
 config.write_bytes(original);run('systemctl','restart','levants-uat-api.service')
 raise SystemExit('Storefront mapping failed; previous UAT configuration restored') from None
print(json.dumps({'storefront':'https://uat.levantsdairy.co.uk','uatCors':True,'customerLinksMapped':True}))
