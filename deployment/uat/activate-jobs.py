#!/usr/bin/env python3
"""Enable only UAT schedules after sandbox and database validation."""
import json,os,subprocess,time,urllib.request
from pathlib import Path
source=Path('/srv/levants-uat/current/server/config/uatSafety.js').read_text()
if 'UAT background jobs require Stripe sandbox mode' not in source:
    raise SystemExit('Deploy scheduler-aware UAT safety checks first')
config=Path('/etc/levants-uat/api.env');original=config.read_bytes()
backup=Path('/etc/levants-uat/api.before-jobs.env')
if backup.exists(): raise SystemExit('Job activation backup exists; inspect state before retrying')
fd=os.open(backup,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
with os.fdopen(fd,'wb') as f:f.write(original)
def run(*args):subprocess.run(args,check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
since=str(int(time.time()))
try:
    lines=[line for line in original.decode().splitlines() if line.split('=',1)[0]!='BACKGROUND_JOBS_ENABLED']
    lines.append('BACKGROUND_JOBS_ENABLED="true"')
    config.write_text('\n'.join(lines)+'\n')
    run('systemctl','restart','levants-uat-api.service')
    for attempt in range(30):
        try:
            with urllib.request.urlopen('http://127.0.0.1:5002/health',timeout=2) as r:health=json.load(r)
            if health.get('success') and health['data'].get('deploymentEnvironment')=='uat' and health['data'].get('backgroundJobsEnabled') is True:break
        except Exception:pass
        time.sleep(1)
    else:raise RuntimeError('UAT jobs did not become healthy')
    expected=['Order expiration','Invitation cleanup','Subscription invoice/price reconciliation']
    for attempt in range(10):
        logs=subprocess.run(['journalctl','-u','levants-uat-api.service','--since','@'+since,'--no-pager','-o','cat'],capture_output=True,text=True,check=True).stdout
        if all(name in logs for name in expected):break
        time.sleep(1)
    else:raise RuntimeError('UAT scheduler registration not confirmed')
except Exception:
    config.write_bytes(original);run('systemctl','restart','levants-uat-api.service')
    raise SystemExit('Job activation failed; previous UAT configuration restored') from None
print(json.dumps({'uatJobsEnabled':True,'registeredJobGroups':len(expected),'productionUntouched':True}))
