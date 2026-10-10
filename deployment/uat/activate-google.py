#!/usr/bin/env python3
"""Activate shared Google services using protected UAT credentials and rollback."""
import ipaddress,json,os,re,shlex,socket,stat,subprocess,time,urllib.request
from pathlib import Path
p=Path('/etc/levants-uat/google.pending.env')
if p.is_symlink() or p.stat().st_uid!=0 or stat.S_IMODE(p.stat().st_mode)!=0o600:
    raise SystemExit('UAT Google settings must be root-owned with mode 600')
v=dict(line.split('=',1) for line in p.read_text().splitlines() if line and not line.startswith('#'))
for name in ['GOOGLE_MAPS_API_KEY','GOOGLE_PROJECT_ID']:
    parts=shlex.split(v.get(name,''),comments=True)
    if len(parts)!=1: raise SystemExit('Invalid Google setting format: '+name)
    v[name]=parts[0]
for name,pattern in [('GOOGLE_MAPS_API_KEY',r'[A-Za-z0-9_-]+'),('GOOGLE_PROJECT_ID',r'[a-z][a-z0-9-]{4,61}[a-z0-9]')]:
    if not re.fullmatch(pattern,v.get(name,'')): raise SystemExit('Invalid Google setting: '+name)
credential=Path('/etc/levants-uat/google-service-account.json')
if credential.is_symlink() or credential.stat().st_uid!=0 or stat.S_IMODE(credential.stat().st_mode)!=0o640:
    raise SystemExit('Protected UAT service-account copy must be root-owned with mode 640')
source=Path('/srv/levants-uat/current/server/services/googleRoute.service.js').read_text()
if '/etc/levants-uat/google-service-account.json' not in source: raise SystemExit('Deploy UAT Google support first')
hosts=['maps.googleapis.com','oauth2.googleapis.com','routeoptimization.googleapis.com']
addresses=sorted({r[4][0] for host in hosts for r in socket.getaddrinfo(host,443,type=socket.SOCK_STREAM)})
if not addresses or not all(ipaddress.ip_address(a).is_global for a in addresses): raise SystemExit('Invalid Google API resolution')
config=Path('/etc/levants-uat/api.env'); original=config.read_bytes()
dropin=Path('/etc/systemd/system/levants-uat-api.service.d/google.conf')
old_dropin=dropin.read_bytes() if dropin.exists() else None
backup=Path('/etc/levants-uat/api.before-google.env')
if backup.exists():
    if backup.read_bytes()!=original or old_dropin is not None:
        raise SystemExit('Google activation state differs from backup; inspect before retrying')
else:
    fd=os.open(backup,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
    with os.fdopen(fd,'wb') as f: f.write(original)
def run(*args): subprocess.run(args,check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
try:
    updates={name:v[name] for name in ['GOOGLE_MAPS_API_KEY','GOOGLE_PROJECT_ID']}
    updates.update({'UAT_GOOGLE_MODE':'enabled','GOOGLE_APPLICATION_CREDENTIALS':str(credential)})
    lines=[line for line in original.decode().splitlines() if line.split('=',1)[0] not in updates]
    lines += [name+'='+json.dumps(value) for name,value in updates.items()]
    config.write_text('\n'.join(lines)+'\n')
    dropin.parent.mkdir(mode=0o755,exist_ok=True)
    dropin.write_text('[Service]\n# DNS snapshot for Google geocoding, OAuth and route optimisation; refresh if provider addresses change.\nIPAddressAllow='+' '.join(addresses)+'\n')
    run('systemctl','daemon-reload');run('systemctl','restart','levants-uat-api.service')
    for attempt in range(30):
        try:
            with urllib.request.urlopen('http://127.0.0.1:5002/health',timeout=2) as r: health=json.load(r)
            if health.get('success') and health['data'].get('deploymentEnvironment')=='uat': break
        except Exception: pass
        time.sleep(1)
    else: raise RuntimeError('UAT unhealthy')
    allow=list(addresses)
    for name in ['stripe.conf','resend.conf','cloudinary.conf']:
        policy=Path('/etc/systemd/system/levants-uat-api.service.d')/name
        if policy.exists(): allow += policy.read_text().split('IPAddressAllow=',1)[1].split()
    code = r"""const assert=require('node:assert/strict');let phase='geocoding';
(async()=>{const location=await require('./Integration/google.geocode').geocodeAddress({line1:'Trafalgar Square',city:'London',country:'United Kingdom'});
assert.ok(Number.isFinite(location.lat)&&Number.isFinite(location.lng));phase='route-optimisation';
const start=new Date(Date.now()+3600000),end=new Date(start.getTime()+8*3600000);
const route=await require('./services/googleRoute.service').optimizeRoutes({timeout:'30s',model:{globalStartTime:start.toISOString().replace(/\.\d{3}Z$/, 'Z'),globalEndTime:end.toISOString().replace(/\.\d{3}Z$/, 'Z'),vehicles:[{label:'uat-public-location-check',startLocation:{latitude:51.5007,longitude:-0.1246},endLocation:{latitude:51.5007,longitude:-0.1246},costPerHour:10}],shipments:[{label:'public-landmark',deliveries:[{arrivalLocation:{latitude:51.5055,longitude:-0.0754},duration:'60s'}]}]}});
assert.ok(route.routes?.some(r=>r.visits?.length===1));console.log('uat-google-verified');})().catch(e=>{console.log(JSON.stringify({googleCheckFailed:true,phase,httpStatus:e.response?.status||null,providerStatus:e.response?.data?.error?.status||null}));process.exit(1);});"""
    command=['systemd-run','--unit=levants-uat-google-check','--collect','--quiet','--wait','--pipe','-p','User=levants-uat','-p','WorkingDirectory=/srv/levants-uat/current/server','-p','EnvironmentFile=/etc/levants-uat/api.env','-p','IPAddressDeny=any','-p','IPAddressAllow=localhost','-p','IPAddressAllow='+' '.join(allow),'/usr/bin/node','-e',code]
    result=subprocess.run(command,capture_output=True,timeout=100)
    if result.returncode or b'uat-google-verified' not in result.stdout:
        for line in result.stdout.decode(errors='replace').splitlines():
            if line.startswith('{'):
                try:
                    diagnostic=json.loads(line)
                    if diagnostic.get('googleCheckFailed'):
                        print(json.dumps({k:diagnostic.get(k) for k in ['googleCheckFailed','phase','httpStatus','providerStatus']}))
                except ValueError: pass
        raise RuntimeError('UAT Google test failed')
except Exception:
    config.write_bytes(original)
    if old_dropin is None: dropin.unlink(missing_ok=True)
    else: dropin.write_bytes(old_dropin)
    run('systemctl','daemon-reload');run('systemctl','restart','levants-uat-api.service')
    raise SystemExit('Google activation failed; prior UAT configuration restored; diagnostic output withheld') from None
print(json.dumps({'uatGoogleEnabled':True,'geocodingVerified':True,'routeOptimisationVerified':True,'testData':'public-landmarks-only'}))
