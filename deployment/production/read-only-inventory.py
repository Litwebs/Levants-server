#!/usr/bin/env python3
"""Read-only production deployment inventory; never executes deployment helpers."""
import hashlib,json,os,re,subprocess
from pathlib import Path
EXPECTED='144badd63cb5263ad8eb89ce4f353816515f0fd4'
BASE=Path('/root/LWS-Scripts/Levants-server')
def git(path,*args):
 return subprocess.check_output(['git','-C',str(path),*args],text=True,stderr=subprocess.DEVNULL,timeout=15).strip()
if os.geteuid()!=0 or git(BASE,'rev-parse','HEAD')!=EXPECTED:raise SystemExit('Production identity guard failed')
report={'readOnly':True,'productionHeadBefore':EXPECTED}
def safe(line):
 line=re.sub(r'(?:https?|mongodb(?:\+srv)?)://[^\s\'"]+','<url>',line)
 line=re.sub(r'\b(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9]+|whsec_[A-Za-z0-9]+|re_[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9]+','<credential>',line)
 line=re.sub(r'(?i)((?:password|token|secret|api_key|private_key)\s*=\s*)(?:"[^"]*"|\'[^\']*\'|\S+)',r'\1<redacted>',line)
 return line
helpers=[]
for p in sorted(Path('/root/LWS-Scripts').glob('*.sh')):
 if p.stat().st_size>262144:continue
 text=p.read_text()
 if p.name!='05-auto-deploy.sh' and not ('Levants-client' in text or 'levantsdairy.co.uk' in text and ('npm' in text or 'dist' in text)):continue
 helpers.append({'name':p.name,'sha256':hashlib.sha256(text.encode()).hexdigest(),'syntaxValid':subprocess.run(['bash','-n',str(p)],capture_output=True).returncode==0,
 'selectedLines':[{'line':i+1,'text':safe(line)} for i,line in enumerate(text.splitlines()) if re.search(r'\bgit\b|DEPLOY_SHA|SKIP_CLIENT_BUILD|\bnpm\b|\bpm2\b|systemctl|\bset\b|\btrap\b|\bfalse\b|\breturn\b|PROJECT_PATH|BASE_DIR|SERVER_DIR|ROLLBACK_REQUIRED|\bexit\b|\bif\b|\belse\b|\bfi\b|REPO_DIR|BUILD_DIR|\bcd\b',line) and not re.search(r'password|token|secret|api.key|private.key',line,re.I)]})
report['helpers']=helpers
sites=[]
for p in sorted(Path('/etc/nginx/sites-enabled').glob('*')):
 if not p.is_file() or p.stat().st_size>262144:continue
 text=p.read_text()
 if not re.search(r'(?<![-\w])(?:www\.)?levantsdairy\.co\.uk|api\.levantsdairy\.co\.uk',text):continue
 sites.append({'file':p.name,'sha256':hashlib.sha256(text.encode()).hexdigest(),'selectedLines':[safe(l.strip()) for l in text.splitlines() if re.match(r'\s*(?:server_name|root|alias|location|proxy_pass|try_files|include|ssl_certificate)\b',l)]})
report['nginxSites']=sites
report['clientRepositories']=[]
for p in [Path('/root/LWS-Scripts/Levants-client'),Path('/var/www/Levants-client'),Path('/var/www/levantsdairy.co.uk')]:
 if not p.exists():continue
 row={'path':str(p),'isGit':(p/'.git').exists()}
 if row['isGit']:row['head']=git(p,'rev-parse','HEAD');row['branch']=git(p,'branch','--show-current')
 report['clientRepositories'].append(row)
env={}
for l in (BASE/'server/.env').read_text().splitlines():
 m=re.match(r'\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$',l)
 if m:env[m[1]]=m[2].strip("'\"")
report['productionConfiguration']={'appEnvIsUat':env.get('APP_ENV')=='uat','nodeEnvProduction':env.get('NODE_ENV')=='production',
 'jobsDisabled':env.get('BACKGROUND_JOBS_ENABLED')=='false','recoveryAlertsEnabled':env.get('SUBSCRIPTION_RECOVERY_ALERTS_ENABLED')=='true',
 'recoveryRecipientMatches':env.get('SUBSCRIPTION_RECOVERY_ALERT_EMAIL')=='hm.mousavi.02@gmail.com',
 'portalOriginCorrect':env.get('CLIENT_FRONT_URL_PROD','').rstrip('/')=='https://levantsdairy.co.uk',
 'resendKeyPresent':bool(env.get('RESEND_EMAIL_KEY') or env.get('RESEND_API_KEY') or env.get('RESEND_URI'))}
# Read-only UAT Google network inspection: counts only, no credentials or IPs.
try:
 import socket,ipaddress
 policy=Path('/etc/systemd/system/levants-uat-api.service.d/google.conf')
 allowed=set()
 for row in policy.read_text().splitlines():
  if row.startswith('IPAddressAllow='):
   for value in row.split('=',1)[1].split():
    try:allowed.add(str(ipaddress.ip_address(value)))
    except ValueError:pass
 endpoints=[]
 for label,host in [('geocoding','maps.googleapis.com'),('oauth','oauth2.googleapis.com'),('route-optimization','routeoptimization.googleapis.com')]:
  resolved={result[4][0] for result in socket.getaddrinfo(host,443,type=socket.SOCK_STREAM)}
  endpoints.append({'endpoint':label,'resolvedAddressCount':len(resolved),'coveredAddressCount':len(resolved & allowed),'allResolvedAddressesAllowed':bool(resolved) and resolved.issubset(allowed)})
 report['uatGoogleNetworkPolicy']={'inspection':'available','endpoints':endpoints}
except Exception:
 report['uatGoogleNetworkPolicy']={'inspection':'unavailable'}
report['productionHeadAfter']=git(BASE,'rev-parse','HEAD')
if report['productionHeadAfter']!=EXPECTED:raise SystemExit('Production identity changed')
print(json.dumps(report))
