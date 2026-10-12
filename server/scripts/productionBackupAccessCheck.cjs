"use strict";
const fs=require("node:fs");
const {execFileSync}=require("node:child_process");
require("dotenv").config({override:true,quiet:true});
const {MongoClient}=require("mongoose").mongo;
let client;
const report={readOnly:true,completed:false};
async function main(){
 if(process.env.NODE_ENV!=="production"||process.env.APP_ENV==="uat"||!process.env.MONGO_URI)throw Error("production_guard");
 report.productionHead=execFileSync("git",["rev-parse","HEAD"],{encoding:"utf8",stdio:["ignore","pipe","ignore"]}).trim();
 client=new MongoClient(process.env.MONGO_URI,{maxPoolSize:1,serverSelectionTimeoutMS:10000});await client.connect();
 const db=client.db();if(/uat|test|rehearsal/i.test(db.databaseName))throw Error("production_guard");
 const admin=db.admin();const hello=await admin.command({hello:1});report.replicaSet=Boolean(hello.setName);
 const status=await admin.command({connectionStatus:1,showPrivileges:true});
 const privileges=status.authInfo?.authenticatedUserPrivileges||[];
 report.authenticatedRoles=(status.authInfo?.authenticatedUserRoles||[]).map(r=>r.role);
 report.adminUserCreationPrivilege=privileges.some(p=>(p.resource?.anyResource||p.resource?.db==="admin")&&p.actions?.includes("createUser"));
 report.adminRoleGrantPrivilege=privileges.some(p=>(p.resource?.anyResource||p.resource?.db==="admin")&&p.actions?.includes("grantRole"));
 report.oplogReadable=false;
 try{report.oplogReadable=Boolean(await client.db("local").collection("oplog.rs").findOne({},{projection:{ts:1},maxTimeMS:5000}));}catch(e){report.oplogReadErrorCode=typeof e.code==="number"?e.code:null;}
 const dir="/root/LWS-Scripts";
 report.setupScripts=[];
 for(const name of fs.readdirSync(dir).filter(n=>/mongo.*\.sh$/i.test(n)).slice(0,20)){
  const path=dir+"/"+name;const st=fs.lstatSync(path);if(!st.isFile()||st.size>262144)continue;
  const content=fs.readFileSync(path,"utf8");
  report.setupScripts.push({name,createsMongoUsers:/createUser|create-user/.test(content),usesPasswordPrompt:/passwordPrompt|read\s+[^\n]*-[^\s]*s/.test(content),
   referencesAdminVariable:/MONGO_ADMIN|ADMIN_USER|ADMIN_PASS|ROOT_PASSWORD/.test(content),
   variableNames:[...new Set([...content.matchAll(/\\b(?:MONGO|ADMIN|ROOT|DB)_[A-Z_]+\\b/g)].map(m=>m[0]))],
   sourcedPaths:[...content.matchAll(/^\\s*(?:source|\\.)\\s+["']?([^\\s"'\\n;]+)/gm)].map(m=>m[1]).filter(p=>/^[a-zA-Z0-9_./$}{-]+$/.test(p)),
   adminAssignments:[...content.matchAll(/^\\s*(?:export\\s+)?([A-Z_]*(?:ADMIN|ROOT)[A-Z_]*)=(.*)$/gm)].map(m=>({variable:m[1],source:m[2].includes("$")?"expansion_or_command":"literal_or_empty"})),
   referencesEnvironmentFile:/dotenv|source\s+[^\n]*\.env|\.\s+[^\n]*\.env/.test(content)});
 }
 report.backupConnectionConfigured=Boolean(process.env.PROD_MONGO_BACKUP_URI||process.env.MONGO_BACKUP_URI);
 report.completed=true;
}
main().catch(e=>{report.reason=e.message==="production_guard"?"production_guard":"inspection_failed";report.errorCode=typeof e.code==="number"?e.code:null;process.exitCode=1;}).finally(async()=>{await client?.close();console.log(JSON.stringify(report));});
