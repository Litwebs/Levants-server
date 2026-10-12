#!/usr/bin/env python3
"""Configure UAT only, or verify one synthetic recovery alert in an isolated DB."""
import fcntl,json,os,re,secrets,subprocess,sys,urllib.parse,urllib.request
from pathlib import Path
ROOT=Path('/srv/levants-uat'); CONFIG=Path('/etc/levants-uat/api.env')
report={'uatOnly':True,'completed':False}; clone=None; owned=False; stage='guards'

def parse_env(content):
    values={}
    for line in content.splitlines():
        if '=' not in line or line.startswith('#'): continue
        key,value=line.split('=',1)
        try: values[key]=json.loads(value)
        except ValueError: values[key]=value.strip('"\'')
    return values

def node(code,data,environment):
    result=subprocess.run(['/usr/bin/node','-e',code],input=json.dumps(data),capture_output=True,text=True,timeout=90,cwd=str(current/'server'),env=environment)
    if result.returncode: raise RuntimeError('isolated_check_failed')
    try: return json.loads(result.stdout.strip().splitlines()[-1])
    except (ValueError,IndexError): raise RuntimeError('isolated_output_failed')

try:
    if os.geteuid()!=0 or len(sys.argv)!=4: raise RuntimeError('arguments_guard')
    phase,sha,recipient=sys.argv[1:]
    if phase not in {'configure','verify'} or not re.fullmatch('[0-9a-f]{40}',sha) or len(recipient)>254 or not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+',recipient): raise RuntimeError('arguments_guard')
    lock=open('/run/lock/levants-uat-deploy.lock','a');fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
    if CONFIG.is_symlink() or CONFIG.stat().st_uid!=0 or CONFIG.stat().st_mode&0o077: raise RuntimeError('configuration_guard')
    original=CONFIG.read_text(); values=parse_env(original)
    source=urllib.parse.urlsplit(values.get('MONGO_URI',''))
    if values.get('APP_ENV')!='uat' or source.hostname!='127.0.0.1' or source.port!=27018 or source.path!='/levants_uat' or not values.get('STRIPE_SECRET_KEY','').startswith('sk_test_'): raise RuntimeError('configuration_guard')
    if phase=='configure':
        stage='uat_configuration'
        updates={'SUBSCRIPTION_RECOVERY_ALERTS_ENABLED':'true','SUBSCRIPTION_RECOVERY_ALERT_EMAIL':recipient}
        if not all(values.get(key)==value for key,value in updates.items()):
            backup=CONFIG.parent/'api.before-recovery-alerts.env'
            if not backup.exists():
                fd=os.open(backup,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
                with os.fdopen(fd,'w') as file: file.write(original)
            lines=[line for line in original.splitlines() if line.split('=',1)[0] not in updates]
            lines += [key+'='+json.dumps(value) for key,value in updates.items()]
            temp=CONFIG.parent/('api.recovery-'+secrets.token_hex(8)+'.env')
            fd=os.open(temp,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
            with os.fdopen(fd,'w') as file: file.write('\n'.join(lines)+'\n')
            os.replace(temp,CONFIG)
        report.update({'completed':True,'configured':True,'restartDeferredToGatedUatDeployment':True})
    else:
        stage='isolated_alert_verification'
        current=(ROOT/'current').resolve()
        if current.parent!=(ROOT/'releases').resolve() or current.name!=sha: raise RuntimeError('release_guard')
        manifest=json.loads((current/'release.json').read_text())
        if manifest.get('environment')!='uat' or manifest.get('sha')!=sha: raise RuntimeError('release_guard')
        with urllib.request.urlopen('http://127.0.0.1:5002/health',timeout=5) as response: health=json.load(response)['data']
        if health.get('release')!=sha or health.get('deploymentEnvironment')!='uat': raise RuntimeError('release_guard')
        if values.get('SUBSCRIPTION_RECOVERY_ALERTS_ENABLED')!='true' or values.get('SUBSCRIPTION_RECOVERY_ALERT_EMAIL')!=recipient or values.get('EMAIL_TRANSPORT')!='resend': raise RuntimeError('configuration_guard')
        admin=json.loads(Path('/etc/levants-uat/mongodb/admin.json').read_text())
        if admin.get('username')!='levants_uat_admin': raise RuntimeError('admin_guard')
        root_uri='mongodb://'+urllib.parse.quote(admin['username'],safe='')+':'+urllib.parse.quote(admin['password'],safe='')+'@127.0.0.1:27018/admin?authSource=admin&replicaSet=levants-uat'
        clone='levants_uat_alert_'+secrets.token_hex(12)
        environment={**os.environ,**values,'MONGO_URI':root_uri.replace('/admin?','/'+clone+'?')}
        common="const fs=require('fs'),assert=require('assert/strict'),mongoose=require('mongoose');const input=JSON.parse(fs.readFileSync(0,'utf8'));let client;async function main(){"
        ending="}main().catch(()=>process.exitCode=1).finally(async()=>{await mongoose.disconnect();await client?.close();});"
        node(common+"client=new mongoose.mongo.MongoClient(input.uri);await client.connect();assert.equal((await client.db().admin().listDatabases()).databases.some(d=>d.name===input.db),false);console.log(JSON.stringify({fresh:true}));"+ending,{'uri':root_uri,'db':clone},environment)
        owned=True
        code=common+"""assert.equal(process.env.APP_ENV,'uat');assert.match(input.db,/^levants_uat_alert_[a-f0-9]{24}$/);await mongoose.connect(process.env.MONGO_URI);assert.equal(mongoose.connection.name,input.db);
const Alerts=require('./models/subscriptionRecoveryAlert.model');await Alerts.init();await require('./models/schedulerLease.model').init();
const marker='in_'+input.db;const invoice={_id:new mongoose.Types.ObjectId(),subscription:new mongoose.Types.ObjectId(),invoiceId:marker,inventoryBlocked:true,createdAt:new Date()};
await mongoose.connection.db.collection('subscriptioninvoicefulfillments').insertOne(invoice);
const audit=require('./services/subscriptions/subscriptionRecoveryAudit.service').auditUnresolvedSubscriptionOperations;
assert.equal((await audit()).count,1);const alert=await Alerts.findOne({notified:true}).lean();assert.ok(alert?.providerId);assert.equal(alert.payload.to,input.recipient);assert.ok(alert.payload.text.includes(marker));
assert.equal((await audit()).count,1);assert.equal(await Alerts.countDocuments({notified:true}),1);
await mongoose.connection.db.collection('subscriptioninvoicefulfillments').updateOne({_id:invoice._id},{$set:{inventoryBlocked:false,completedAt:new Date()}});
assert.equal((await audit()).count,0);assert.equal((await Alerts.findById(alert._id).lean()).active,false);
console.log(JSON.stringify({passed:true,syntheticMarker:marker,providerAccepted:true,repeatSuppressed:true,resolutionObserved:true,release:input.sha}));"""+ending
        report['verification']=node(code,{'db':clone,'recipient':recipient,'sha':sha},environment)
        report['completed']=True
except Exception as error:
    report['failedStage']=stage
    report['reason']=str(error) if str(error) in {'arguments_guard','configuration_guard','isolated_check_failed','isolated_output_failed','release_guard','admin_guard'} else type(error).__name__
finally:
    if owned and clone:
        try:
            node(common+"assert.match(input.db,/^levants_uat_alert_[a-f0-9]{24}$/);client=new mongoose.mongo.MongoClient(input.uri);await client.connect();await client.db(input.db).dropDatabase();console.log(JSON.stringify({cleaned:true}));"+ending,{'uri':root_uri,'db':clone},environment)
            report['isolatedDatabaseRemoved']=True
        except Exception: report['completed']=False;report['isolatedDatabaseRemoved']=False
    print(json.dumps(report))
    if not report['completed']: raise SystemExit(1)
