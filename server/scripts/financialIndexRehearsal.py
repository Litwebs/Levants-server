#!/usr/bin/env python3
"""Trusted bundle is received over stdin; credentials remain on the VPS."""
import hashlib, json, os, re, secrets, subprocess, sys, urllib.parse, urllib.request
from pathlib import Path

PROD=Path('/root/LWS-Scripts/Levants-server'); UAT=Path('/srv/levants-uat')
EXPECTED='144badd63cb5263ad8eb89ce4f353816515f0fd4'
report={'completed':False}; client_uri=None; clone=None; owned=False; stage='guards'

def command(args, **kwargs):
    result=subprocess.run(args,capture_output=True,text=True,timeout=kwargs.pop('timeout',90),**kwargs)
    if result.returncode: raise RuntimeError('command_failed')
    return result.stdout

def snapshot():
    head=command(['git','-C',str(PROD),'rev-parse','HEAD']).strip()
    if head!=EXPECTED: raise RuntimeError('production_head_changed')
    processes=[]
    for p in Path('/proc').iterdir():
        if not p.name.isdigit(): continue
        try:
            if Path(os.readlink(p/'exe').removesuffix(' (deleted)')).name not in {'node','nodejs'}: continue
            if not os.readlink(p/'cwd').startswith(str(PROD)): continue
            processes.append([int(p.name),(p/'stat').read_text().rsplit(')',1)[1].split()[19]])
        except (OSError,ValueError): pass
    if not processes: raise RuntimeError('production_process_guard')
    with urllib.request.urlopen('https://api.levantsdairy.co.uk/health',timeout=10) as response:
        if response.status!=200: raise RuntimeError('production_health_failed')
    return {'head':head,'processes':sorted(processes)}

NODE='''const fs=require('fs'),Module=require('module'),assert=require('assert/strict'),crypto=require('crypto');const input=JSON.parse(fs.readFileSync(0,'utf8'));const {MongoClient,BSON}=require('mongoose').mongo;let client;
function load(name){const m=new Module(process.cwd()+'/scripts/'+name,module);m.filename=process.cwd()+'/scripts/'+name;m.paths=Module._nodeModulePaths(process.cwd());const original=m.require.bind(m);m.require=(id)=>id==='./financialIndexes.cjs'?load('financialIndexes.cjs'):original(id);m._compile(input.modules[name],m.filename);return m.exports;}
async function main(){BODY}
main().catch(e=>{console.log(JSON.stringify({completed:false,reason:'node_failed',errorCode:typeof e.code==='number'?e.code:null}));process.exitCode=1;}).finally(async()=>{await client?.close();});'''

def node(body, data, cwd, timeout=90):
    data['modules']=bundle['modules']
    # Suppress tool errors, which can include connection details. Emit only parsed JSON.
    result=subprocess.run(['/usr/bin/node','-e',NODE.replace('BODY',body)],input=json.dumps(data),capture_output=True,text=True,cwd=str(cwd),timeout=timeout,env={**os.environ,'NODE_ENV':'production'})
    try: output=json.loads(result.stdout.strip().splitlines()[-1])
    except (ValueError,IndexError): raise RuntimeError('node_output_failed')
    if result.returncode: report['nodeResult']=output;raise RuntimeError('node_failed')
    return output

try:
    bundle=globals().get('bundle') or json.load(sys.stdin)
    phase=bundle.get('phase')
    if os.geteuid()!=0 or phase not in {'rehearse','apply'}: raise RuntimeError('phase_guard')
    report['phase']=phase
    before=snapshot(); report['productionHeadBefore']=before['head']
    if phase=='rehearse':
        current=(UAT/'current').resolve()
        if current.parent!=(UAT/'releases').resolve(): raise RuntimeError('uat_release_guard')
        manifest=json.loads((current/'release.json').read_text())
        if manifest.get('environment')!='uat': raise RuntimeError('uat_release_guard')
        admin=json.loads(Path('/etc/levants-uat/mongodb/admin.json').read_text())
        if admin.get('username')!='levants_uat_admin': raise RuntimeError('uat_admin_guard')
        client_uri='mongodb://'+urllib.parse.quote(admin['username'],safe='')+':'+urllib.parse.quote(admin['password'],safe='')+'@127.0.0.1:27018/admin?authSource=admin&replicaSet=levants-uat'
        clone='levants_uat_index_'+secrets.token_hex(12)
        stage='fresh_namespace'
        node("client=new MongoClient(input.uri);await client.connect();assert.equal((await client.db().admin().listDatabases()).databases.some(d=>d.name===input.db),false);console.log(JSON.stringify({fresh:true}));",{'uri':client_uri,'db':clone},current/'server')
        owned=True;stage='index_rehearsal'
        body='''client=new MongoClient(input.uri);await client.connect();const db=client.db(input.db);const {specs,options,reconcile}=load('financialIndexes.cjs');
const fixtures=specs.map((spec,n)=>Object.fromEntries(Object.keys(spec[1]).map(k=>[k,'fixture-'+n+'-'+k])));
for(const [n,spec] of specs.entries()){await db.collection(spec[0]).insertOne({...fixtures[n]});if(spec[3]){const excluded={...fixtures[n]};delete excluded[spec[3]];await db.collection(spec[0]).insertMany([{...excluded},{...excluded}]);}}
const dry=await reconcile(db);assert.equal(dry.indexes.length,6);assert.ok(dry.indexes.every(i=>!i.alreadyPresent&&!i.created));
const duplicated=await db.collection(specs[5][0]).insertOne({...fixtures[5]});await assert.rejects(reconcile(db,{apply:true}),/duplicates_require_review/);
for(const spec of specs){assert.equal((await db.collection(spec[0]).listIndexes().toArray()).length,1);}await db.collection(specs[5][0]).deleteOne({_id:duplicated.insertedId});
await db.collection(specs[0][0]).createIndex(specs[0][1],{name:specs[0][2]});await assert.rejects(reconcile(db,{apply:true}),/conflicting_index_requires_review/);await db.collection(specs[0][0]).dropIndex(specs[0][2]);
async function digest(){const h=crypto.createHash('sha256');for(const spec of specs){for await(const d of db.collection(spec[0]).find({}).sort({_id:1}))h.update(BSON.serialize(d));}return h.digest('hex');}
const prior=await digest();const applied=await reconcile(db,{apply:true});assert.ok(applied.indexes.every(i=>i.created&&i.verified));assert.equal(await digest(),prior);
for(const [n,spec] of specs.entries()){await assert.rejects(db.collection(spec[0]).insertOne({...fixtures[n]}),e=>e.code===11000);}
const repeat=await reconcile(db,{apply:true});assert.ok(repeat.indexes.every(i=>i.alreadyPresent&&!i.created&&i.verified));assert.equal(await digest(),prior);
console.log(JSON.stringify({completed:true,indexesCreatedAndVerified:6,duplicatesRejected:6,partialExclusionsPassed:true,duplicatePreflightAbortedBeforeWrites:true,conflictingDefinitionRejected:true,documentsUnchanged:true,idempotentRepeatPassed:true}));'''
        report['rehearsal']=node(body,{'uri':client_uri,'db':clone},current/'server',timeout=180)
        report['productionPlan']=node("const result=await load('applyProductionFinancialIndexes.cjs').run([]);console.log(JSON.stringify(result));if(!result.completed)process.exitCode=1;",{},PROD/'server',timeout=180)
    else:
        stage='production_index_application'
        report['productionApplication']=node("const result=await load('applyProductionFinancialIndexes.cjs').run(['--apply-indexes-only']);console.log(JSON.stringify(result));if(!result.completed)process.exitCode=1;",{},PROD/'server',timeout=600)
    stage='production_identity'
    after=snapshot()
    if before!=after: raise RuntimeError('production_process_changed')
    report['productionHeadAfter']=after['head'];report['productionApplicationProcessesUnchanged']=True;report['productionHealthPassed']=True
    report['completed']=True
except Exception as e:
    report['failedStage']=stage
    report['reason']=str(e) if str(e) in {'command_failed','production_head_changed','production_process_guard','production_health_failed','phase_guard','uat_release_guard','uat_admin_guard','node_output_failed','node_failed','production_process_changed'} else type(e).__name__
finally:
    if owned and clone and client_uri:
        try:
            node("assert.match(input.db,/^levants_uat_index_[a-f0-9]{24}$/);client=new MongoClient(input.uri);await client.connect();await client.db(input.db).dropDatabase();console.log(JSON.stringify({cleaned:true}));",{'uri':client_uri,'db':clone},current/'server')
            report['isolatedFixtureDatabaseRemoved']=True
        except Exception: report['isolatedFixtureDatabaseRemoved']=False;report['completed']=False
    print(json.dumps(report))
    if not report.get('completed'): raise SystemExit(1)
