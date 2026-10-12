#!/usr/bin/env python3
"""Activate shared Cloudinary with guarded UAT-only assets and rollback."""
import ipaddress,json,os,re,socket,stat,subprocess,time,urllib.request
from pathlib import Path
p=Path('/etc/levants-uat/cloudinary.pending.env')
if p.is_symlink() or p.stat().st_uid!=0 or stat.S_IMODE(p.stat().st_mode)!=0o600:
    raise SystemExit('UAT Cloudinary credentials must be root-owned with mode 600')
v=dict(line.split('=',1) for line in p.read_text().splitlines() if line and not line.startswith('#'))
for name,pattern in [('CLOUDINARY_CLOUD_NAME',r'[A-Za-z0-9_-]+'),('CLOUDINARY_API_KEY',r'[0-9]+'),('CLOUDINARY_API_SECRET',r'[A-Za-z0-9_-]+')]:
    if not re.fullmatch(pattern,v.get(name,'')): raise SystemExit('Invalid Cloudinary credential: '+name)
source=Path('/srv/levants-uat/current/server/config/cloudinary.js').read_text()
if 'createUatCloudinary' not in source: raise SystemExit('Deploy guarded UAT Cloudinary support first')
addresses=sorted({r[4][0] for r in socket.getaddrinfo('api.cloudinary.com',443,type=socket.SOCK_STREAM)})
if not addresses or not all(ipaddress.ip_address(a).is_global for a in addresses): raise SystemExit('Invalid Cloudinary API resolution')
config=Path('/etc/levants-uat/api.env'); original=config.read_bytes()
dropin=Path('/etc/systemd/system/levants-uat-api.service.d/cloudinary.conf')
old_dropin=dropin.read_bytes() if dropin.exists() else None
backup=Path('/etc/levants-uat/api.before-cloudinary.env')
if backup.exists(): raise SystemExit('Cloudinary activation backup already exists; inspect state before retrying')
fd=os.open(backup,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
with os.fdopen(fd,'wb') as f: f.write(original)
def run(*args): subprocess.run(args,check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
try:
    updates={name:v[name] for name in ['CLOUDINARY_CLOUD_NAME','CLOUDINARY_API_KEY','CLOUDINARY_API_SECRET']}
    updates['UAT_STORAGE_MODE']='cloudinary'
    lines=[line for line in original.decode().splitlines() if line.split('=',1)[0] not in updates]
    lines += [name+'='+json.dumps(value) for name,value in updates.items()]
    config.write_text('\n'.join(lines)+'\n')
    dropin.parent.mkdir(mode=0o755,exist_ok=True)
    dropin.write_text('[Service]\n# DNS snapshot for api.cloudinary.com; refresh if provider addresses change.\nIPAddressAllow='+' '.join(addresses)+'\n')
    run('systemctl','daemon-reload');run('systemctl','restart','levants-uat-api.service')
    for attempt in range(30):
        try:
            with urllib.request.urlopen('http://127.0.0.1:5002/health',timeout=2) as r: health=json.load(r)
            if health.get('success') and health['data'].get('deploymentEnvironment')=='uat': break
        except Exception: pass
        time.sleep(1)
    else: raise RuntimeError('UAT unhealthy')
    allow=list(addresses)
    for name in ['stripe.conf','resend.conf']:
        policy=Path('/etc/systemd/system/levants-uat-api.service.d')/name
        if policy.exists(): allow += policy.read_text().split('IPAddressAllow=',1)[1].split()
    code = r"""const assert=require('node:assert/strict');const c=require('./config/cloudinary');
(async()=>{await assert.rejects(c.uploader.destroy('production/uat-guard-check'),/outside/);
const asset=await c.uploader.upload('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aGZkAAAAASUVORK5CYII=',{folder:'connectivity-checks',resource_type:'image'});
assert.ok(asset.public_id.startsWith('levants-uat/connectivity-checks/'));
const result=await c.uploader.destroy(asset.public_id,{resource_type:'image'});
assert.equal(result.result,'ok'); console.log('uat-cloudinary-verified');})().catch(()=>process.exit(1));"""
    command=['systemd-run','--unit=levants-uat-cloudinary-check','--collect','--quiet','--wait','--pipe','-p','User=levants-uat','-p','WorkingDirectory=/srv/levants-uat/current/server','-p','EnvironmentFile=/etc/levants-uat/api.env','-p','IPAddressDeny=any','-p','IPAddressAllow=localhost','-p','IPAddressAllow='+' '.join(allow),'/usr/bin/node','-e',code]
    result=subprocess.run(command,capture_output=True,timeout=60)
    if result.returncode or b'uat-cloudinary-verified' not in result.stdout: raise RuntimeError('UAT Cloudinary test failed')
except Exception:
    config.write_bytes(original)
    if old_dropin is None: dropin.unlink(missing_ok=True)
    else: dropin.write_bytes(old_dropin)
    run('systemctl','daemon-reload');run('systemctl','restart','levants-uat-api.service')
    raise SystemExit('Cloudinary activation failed; prior UAT configuration restored; diagnostic output withheld') from None
print(json.dumps({'uatCloudinaryEnabled':True,'uploadAndCleanupVerified':True,'productionDeletionBlocked':True,'assetPrefix':'levants-uat/'}))
