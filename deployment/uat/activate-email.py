#!/usr/bin/env python3
"""Activate the separate UAT Resend key; test only with Resend's simulator."""
import ipaddress,json,os,re,socket,stat,subprocess,time,urllib.request
from pathlib import Path
p=Path('/etc/levants-uat/email.pending.env')
if p.is_symlink() or p.stat().st_uid!=0 or stat.S_IMODE(p.stat().st_mode)!=0o600:
    raise SystemExit('UAT email credentials must be root-owned with mode 600')
v=dict(line.split('=',1) for line in p.read_text().splitlines() if line and not line.startswith('#'))
key=v.get('RESEND_EMAIL_KEY','')
if not re.fullmatch(r're_[A-Za-z0-9_\-]+',key): raise SystemExit('Invalid UAT email key')
source=Path('/srv/levants-uat/current/server/Integration/emailTransport.js').read_text()
if 'prepareUatEmail' not in source: raise SystemExit('Deploy UAT Resend support first')
addresses=sorted({r[4][0] for r in socket.getaddrinfo('api.resend.com',443,type=socket.SOCK_STREAM)})
if not addresses or not all(ipaddress.ip_address(a).is_global for a in addresses): raise SystemExit('Invalid Resend API resolution')
config=Path('/etc/levants-uat/api.env'); original=config.read_bytes()
dropin=Path('/etc/systemd/system/levants-uat-api.service.d/resend.conf')
old_dropin=dropin.read_bytes() if dropin.exists() else None
backup=Path('/etc/levants-uat/api.before-email.env')
if backup.exists(): raise SystemExit('Email activation backup already exists; inspect state before retrying')
fd=os.open(backup,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
with os.fdopen(fd,'wb') as f: f.write(original)
def run(*args): subprocess.run(args,check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
try:
    updates={'EMAIL_TRANSPORT':'resend','RESEND_EMAIL_KEY':key}
    lines=[line for line in original.decode().splitlines() if line.split('=',1)[0] not in updates]
    lines += [name+'='+json.dumps(value) for name,value in updates.items()]
    config.write_text('\n'.join(lines)+'\n')
    dropin.parent.mkdir(mode=0o755,exist_ok=True)
    dropin.write_text('[Service]\n# DNS snapshot for api.resend.com; refresh if provider addresses change.\nIPAddressAllow='+' '.join(addresses)+'\n')
    run('systemctl','daemon-reload');run('systemctl','restart','levants-uat-api.service')
    for attempt in range(30):
        try:
            with urllib.request.urlopen('http://127.0.0.1:5002/health',timeout=2) as r: health=json.load(r)
            if health.get('success') and health['data'].get('deploymentEnvironment')=='uat': break
        except Exception: pass
        time.sleep(1)
    else: raise RuntimeError('UAT unhealthy')
    allow=list(addresses)
    stripe=Path('/etc/systemd/system/levants-uat-api.service.d/stripe.conf')
    if stripe.exists(): allow += stripe.read_text().split('IPAddressAllow=',1)[1].split()
    code='require("./Integration/emailTransport").createEmailTransport().emails.send({to:"delivered@resend.dev",subject:"Email integration check",text:"Synthetic UAT integration check. No customer data."}).then(r=>{if(r.error||!r.data?.id)process.exit(2);console.log("uat-email-accepted")}).catch(()=>process.exit(1));'
    command=['systemd-run','--unit=levants-uat-email-check','--collect','--quiet','--wait','--pipe','-p','User=levants-uat','-p','WorkingDirectory=/srv/levants-uat/current/server','-p','EnvironmentFile=/etc/levants-uat/api.env','-p','IPAddressDeny=any','-p','IPAddressAllow=localhost','-p','IPAddressAllow='+' '.join(allow),'/usr/bin/node','-e',code]
    result=subprocess.run(command,capture_output=True,timeout=60)
    if result.returncode or b'uat-email-accepted' not in result.stdout: raise RuntimeError('UAT email test failed')
except Exception:
    config.write_bytes(original)
    if old_dropin is None: dropin.unlink(missing_ok=True)
    else: dropin.write_bytes(old_dropin)
    run('systemctl','daemon-reload');run('systemctl','restart','levants-uat-api.service')
    raise SystemExit('Email activation failed; prior UAT configuration restored; diagnostic output withheld') from None
print(json.dumps({'uatEmailEnabled':True,'testRecipient':'delivered@resend.dev','providerAccepted':True,'subjectPrefix':'[UAT]','recipientRestrictions':False}))
