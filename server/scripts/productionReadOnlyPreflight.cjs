"use strict";

// Executed through stdin in the existing production server directory.
// No app/model imports, index creation, writes, service starts or provider mutations.
const fs = require("node:fs");
const crypto = require("node:crypto");
require("dotenv").config({ override: true, quiet: true });
const { MongoClient } = require("mongoose").mongo;
const Stripe = require("stripe");
const REQUIRED_EVENTS = ["invoice.created", "invoice.voided", "invoice.marked_uncollectible",
  "invoice.payment_succeeded", "invoice.payment_failed", "customer.subscription.updated",
  "customer.subscription.deleted", "refund.created", "refund.updated", "refund.failed"];
const specs = [
  ["paymentmethods", {customer:1,provider:1,providerReference:1}, "providerReference"],
  ["subscriptiondeliveries", {subscription:1,scheduledDate:1}],
  ["orders", {stripeInvoiceId:1,subscription:1,deliveryDate:1}, "stripeInvoiceId"],
  ["subscriptionmutations", {customer:1,operationId:1}],
  ["subscriptioninvoicefulfillments", {subscription:1,invoiceId:1}],
  ["subscriptionstockreservations", {key:1}],
  ["payments", {subscriptionInvoiceKey:1}, "subscriptionInvoiceKey"],
  ["storecredittransactions", {customer:1,idempotencyKey:1}, "idempotencyKey"]
];
const report = {readOnly:true, completed:false, indexIntegrity:[], subscriptions:[]};
let client;
let stage = "configuration";
const timer = setTimeout(() => { console.log(JSON.stringify({readOnly:true,completed:false,failedStage:stage,reason:"time_limit"})); process.exit(1); }, 240000);
const options = {maxTimeMS:20000};
async function bounded(collection, query, projection, cap=50000) {
  const rows = await collection.find(query, {projection, ...options}).limit(cap+1).toArray();
  if (rows.length > cap) throw new Error("bounded_read_limit");
  return rows;
}
async function pages(list, params) {
  const rows=[];
  for(let page=0;page<40;page++) {
    const result=await list({...params,limit:100,...(rows.length?{starting_after:rows.at(-1).id}:{})});
    rows.push(...result.data);
    if(!result.has_more) return rows;
    if(!result.data.length) throw new Error("invalid_page");
  }
  throw new Error("bounded_provider_limit");
}
async function main() {
  if(process.env.NODE_ENV !== "production" || process.env.APP_ENV === "uat" || !process.env.MONGO_URI || /uat/i.test(process.env.MONGO_URI)) throw new Error("environment_guard");
  if(!/^(sk|rk)_live_/.test(process.env.STRIPE_SECRET_KEY || "")) throw new Error("live_key_required");
  report.configuration = {nodeEnvProduction:true,stripeMode:"live",webhooksEnabled:process.env.STRIPE_WEBHOOKS_ENABLED !== "false",
    signingSecretPresent:/^whsec_/.test(process.env.STRIPE_WEBHOOK_SECRET || ""),emailKeyPresent:Boolean(process.env.RESEND_EMAIL_KEY || process.env.RESEND_API_KEY || process.env.RESEND_URI)};
  stage="database_connection";
  client = new MongoClient(process.env.MONGO_URI, {serverSelectionTimeoutMS:10000,connectTimeoutMS:10000,maxPoolSize:2});
  await client.connect();
  const db=client.db();
  stage="database_topology";
  const hello=await db.admin().command({hello:1});
  const build=await db.admin().command({buildInfo:1});
  report.databaseTopology={serverVersion:build.version,replicaSet:Boolean(hello.setName),sharded:hello.msg==="isdbgrid",
    writablePrimary:hello.isWritablePrimary===true,sessionsSupported:Number.isFinite(hello.logicalSessionTimeoutMinutes),
    transactionTopologySupported:Boolean(hello.setName)||hello.msg==="isdbgrid"};
  report.backupPrerequisites={oplogReadable:false,otherApplicationDatabasesPresent:null,databaseBytes:null};
  try {const row=await client.db("local").collection("oplog.rs").findOne({}, {projection:{ts:1},maxTimeMS:5000});report.backupPrerequisites.oplogReadable=Boolean(row?.ts);}catch(e){report.backupPrerequisites.oplogReadErrorCode=typeof e.code==="number"?e.code:null;}
  try {const names=(await db.admin().listDatabases({nameOnly:true})).databases.map(d=>d.name);report.backupPrerequisites.otherApplicationDatabasesPresent=names.some(n=>![db.databaseName,"admin","config","local"].includes(n));}catch(_){}
  try {const stats=await db.command({dbStats:1});report.backupPrerequisites.databaseBytes=stats.dataSize;}catch(_){}
  const mem=fs.readFileSync("/proc/meminfo","utf8");report.backupPrerequisites.availableMemoryMB=Math.floor(Number(mem.match(/^MemAvailable:\s+(\d+)/m)?.[1]||0)/1024);
  stage="indexes";
  for(const [name,keys,partial] of specs) {
    const collection=db.collection(name);
    let indexes=[];
    try { indexes=await collection.listIndexes().toArray(); } catch(e) { if(e.code!==26) throw e; }
    const same=i=>JSON.stringify(i.key)===JSON.stringify(keys);
    const ok=indexes.some(i=>same(i)&&i.unique===true&&(!partial||i.partialFilterExpression?.[partial]?.$type==="string"));
    const group=Object.fromEntries(Object.keys(keys).map(k=>[k,"$"+k]));
    const pipeline=[...(partial?[{$match:{[partial]:{$type:"string"}}}]:[]),{$group:{_id:group,count:{$sum:1}}},{$match:{count:{$gt:1}}},{$count:"groups"}];
    const duplicates=await collection.aggregate(pipeline,options).toArray();
    report.indexIntegrity.push({collection:name,ok,matchingIndexes:indexes.filter(same).map(i=>({name:i.name,unique:i.unique===true,partialFilterExpression:i.partialFilterExpression||null})),duplicateGroups:duplicates[0]?.groups||0});
  }
  stage="local_records";
  const subs=await bounded(db.collection("subscriptions"),{}, {_id:1,subscriptionNumber:1,status:1,stripeSubscriptionId:1,frequency:1,preferredDeliveryDay:1,preferredDeliveryDays:1,nextDeliveryDate:1,resumePaymentPlan:1},500);
  const orders=await bounded(db.collection("orders"),{}, {_id:1,subscription:1,orderId:1,orderType:1,deliveryDate:1,deliveryStatus:1,status:1,archived:1,stripeInvoiceId:1,subscriptionStockItems:1,subscriptionAddOnStockItems:1,items:1,paymentAllocations:1,stripePaymentIntentId:1,total:1,amountPaid:1,createdAt:1,paidAt:1,refund:1,refunds:1,"metadata.deliveredAt":1,"metadata.deliveryProofUrl":1});
  report.productionNotificationOrderEvidence=orders.filter(o=>["ORD-20261012-6CW5XE","ORD-20261012-KA1PM5"].includes(o.orderId)).map(o=>({orderId:o.orderId,type:o.orderType,status:o.status,createdAt:o.createdAt,paidAt:o.paidAt}));
  const deliveries=await bounded(db.collection("subscriptiondeliveries"),{}, {subscription:1,scheduledDate:1,status:1,order:1});
  const payments=await bounded(db.collection("payments"),{}, {order:1,subscription:1,amount:1,status:1,providerReference:1});
  const plans=await bounded(db.collection("subscriptioninvoicefulfillments"),{}, {subscription:1,invoiceId:1,legacyReviewRequired:1,inventoryBlocked:1,completedAt:1,createdAt:1,refundedAt:1});
  const holds=await bounded(db.collection("subscriptionstockreservations"),{state:"held"},{subscription:1,remaining:1,createdAt:1});
  const variants=await bounded(db.collection("productvariants"),{}, {_id:1,stockQuantity:1,reservedQuantity:1});
  const stale=new Date(Date.now()-120000);
  report.recovery = {
    agedIncompleteMutations:await db.collection("subscriptionmutations").countDocuments({status:{$ne:"completed"},updatedAt:{$lte:stale},$or:[{creationSnapshot:{$ne:null},"creationSnapshot.declined":{$ne:true}},{itemIncreaseSnapshot:{$ne:null}},{decreaseRefundSnapshot:{$ne:null}},{addOnSnapshot:{$ne:null},"addOnSnapshot.paymentIntent.status":{$ne:"requires_payment_method"}}]},options),
    invoicePlansNeedingReview:plans.filter(p=>p.legacyReviewRequired||p.inventoryBlocked||(!p.completedAt&&new Date(p.createdAt)<new Date(Date.now()-7200000))).length,
    agedCardOperations:await db.collection("customers").countDocuments({updatedAt:{$lte:stale},$or:[{paymentMethodOperation:{$ne:null}},{stripeCustomerCreation:{$ne:null}}]},options),
    unfinishedResumes:subs.filter(s=>s.resumePaymentPlan?.id&&!s.resumePaymentPlan.completedAt&&new Date(s.resumePaymentPlan.startedAt)<=stale).length,
    heldReservations:holds.length
  };
  const expected=new Map();
  function add(item) { const id=String(item.variant); expected.set(id,(expected.get(id)||0)+Number(item.quantity||0)); }
  for(const o of orders.filter(o=>o.status==="pending"&&o.archived!==true)) for(const i of o.items||[]) add(i);
  for(const r of holds) for(const i of r.remaining||[]) add(i);
  report.stock={driftVariants:variants.filter(v=>Number(v.reservedQuantity||0)!==(expected.get(String(v._id))||0)||Number(v.stockQuantity)<Number(v.reservedQuantity||0)).length,
    missingVariants:[...expected.keys()].filter(id=>!variants.some(v=>String(v._id)===id)).length,
    variantCount:variants.length,drift:variants.filter(v=>Number(v.reservedQuantity||0)!==(expected.get(String(v._id))||0)||Number(v.stockQuantity)<Number(v.reservedQuantity||0)).map(v=>({variantId:String(v._id),stock:v.stockQuantity,reserved:v.reservedQuantity,expectedReserved:expected.get(String(v._id))||0}))};
  stage="stripe_read_only";
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY,{apiVersion:process.env.STRIPE_API_VERSION||"2024-06-20",timeout:15000,maxNetworkRetries:0});
  const endpoints=await pages(p=>stripe.webhookEndpoints.list(p),{});
  const selected=endpoints.filter(e=>e.status==="enabled"&&(!process.env.STRIPE_SUBSCRIPTION_WEBHOOK_ENDPOINT_ID||e.id===process.env.STRIPE_SUBSCRIPTION_WEBHOOK_ENDPOINT_ID));
  report.webhooks={enabledEndpointCount:endpoints.filter(e=>e.status==="enabled").length,unambiguous:selected.length===1,
    endpoints:endpoints.map(e=>({id:e.id,status:e.status,livemode:e.livemode,url:new URL(e.url).origin+new URL(e.url).pathname,missingEvents:e.enabled_events.includes("*")?[]:REQUIRED_EVENTS.filter(x=>!e.enabled_events.includes(x))}))};
  const dayKey=d=>new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/London",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(d));
  for(const s of subs) {
    const localOrders=orders.filter(o=>String(o.subscription)===String(s._id));
    const slots=deliveries.filter(d=>String(d.subscription)===String(s._id));
    const invoices=s.stripeSubscriptionId?await pages(p=>stripe.invoices.list(p),{subscription:s.stripeSubscriptionId}):[];
    if(invoices.some(i=>i.livemode!==true)) throw new Error("invoice_mode_mismatch");
    const linked=new Set(localOrders.map(o=>o.stripeInvoiceId).filter(Boolean));
    const refunded=new Set(plans.filter(p=>String(p.subscription)===String(s._id)&&p.refundedAt).map(p=>p.invoiceId));
    const unlinked=invoices.filter(i=>(i.paid||i.status==="paid")&&i.amount_paid>0&&!linked.has(i.id)&&!refunded.has(i.id));
    const counts=new Map(); for(const d of slots) {const k=dayKey(d.scheduledDate);counts.set(k,(counts.get(k)||0)+1);}
    report.subscriptions.push({number:s.subscriptionNumber,status:s.status,frequency:s.frequency,orderCount:localOrders.length,slotCount:slots.length,
      paidInvoiceCount:invoices.filter(i=>i.paid||i.status==="paid").length,
      preferredDeliveryDays:s.preferredDeliveryDays?.length?s.preferredDeliveryDays:[s.preferredDeliveryDay],
      nextDeliveryDate:s.nextDeliveryDate||null,
      upcomingSlots:slots.filter(d=>new Date(d.scheduledDate)>=new Date()&&!["cancelled","delivered","skipped"].includes(d.status))
        .sort((a,b)=>new Date(a.scheduledDate)-new Date(b.scheduledDate)).slice(0,3)
        .map(d=>({date:dayKey(d.scheduledDate),status:d.status,linkedOrder:d.order?orders.find(o=>String(o._id)===String(d.order))?.orderId||"missing":null})),
      unlinkedPaidInvoiceCount:unlinked.length,unlinkedPaidMinorByCurrency:unlinked.reduce((a,i)=>{a[i.currency]=(a[i.currency]||0)+i.amount_paid;return a;},{}),
      duplicateLondonDates:[...counts].filter(([,n])=>n>1).map(([date,count])=>({date,count})),
      paidOrdersMissingStockProof:localOrders.filter(o=>o.deliveryStatus==="ordered"&&["paid","partially_refunded"].includes(o.status)&&!(o.subscriptionStockItems||[]).length&&!(o.subscriptionAddOnStockItems||[]).length).length,
      ordersNeedingStockReview:localOrders.filter(o=>o.deliveryStatus==="ordered"&&["paid","partially_refunded"].includes(o.status)&&!(o.subscriptionStockItems||[]).length&&!(o.subscriptionAddOnStockItems||[]).length).map(o=>({orderId:o.orderId,date:o.deliveryDate,status:o.status,deliveryStatus:o.deliveryStatus})),
      orderFulfilment:localOrders.reduce((a,o)=>{const key=String(o.deliveryStatus||"missing");a[key]=(a[key]||0)+1;return a;},{}),
      heldDraftInvoices:invoices.filter(i=>i.status==="draft"&&i.auto_advance===false&&i.created<Date.now()/1000-7200).length});
  }
  stage="legacy_order_evidence";
  const reviewOrders=orders.filter(o=>o.subscription&&o.deliveryStatus==="ordered"&&["paid","partially_refunded"].includes(o.status)&&!(o.subscriptionStockItems||[]).length&&!(o.subscriptionAddOnStockItems||[]).length);
  report.legacyOrders=[];
  const invoiceCache=new Map();
  const intentCache=new Map();
  for(const o of reviewOrders) {
    if(o.stripeInvoiceId&&!invoiceCache.has(o.stripeInvoiceId)) invoiceCache.set(o.stripeInvoiceId,await stripe.invoices.retrieve(o.stripeInvoiceId));
    const invoice=invoiceCache.get(o.stripeInvoiceId);
    const peers=orders.filter(p=>p.stripeInvoiceId===o.stripeInvoiceId&&String(p.subscription)===String(o.subscription));
    const allocations=peers.flatMap(p=>p.paymentAllocations||[]).filter(a=>a.stripeInvoiceId===o.stripeInvoiceId&&a.source==="subscription_invoice");
    const linkedSlots=deliveries.filter(d=>String(d.order)===String(o._id));
    const paymentRows=payments.filter(p=>String(p.order)===String(o._id));
    const intentIds=[...new Set([o.stripePaymentIntentId,...(o.paymentAllocations||[]).map(a=>a.paymentIntentId)].filter(Boolean))];
    const intents=[];
    for(const id of intentIds) {
      if(!intentCache.has(id)) intentCache.set(id,await stripe.paymentIntents.retrieve(id,{expand:["latest_charge"]}));
      const pi=intentCache.get(id);
      if(pi.livemode!==true) throw new Error("invoice_mode_mismatch");
      intents.push({status:pi.status,currency:pi.currency,receivedMinor:pi.amount_received,refundedMinor:typeof pi.latest_charge==="object"?pi.latest_charge.amount_refunded:null,
        refunds:typeof pi.latest_charge==="object"?(await pages(p=>stripe.refunds.list(p),{charge:pi.latest_charge.id})).map(r=>({id:r.id,status:r.status,amountMinor:r.amount,reason:r.reason,
          metadataOrderIds:Object.entries(r.metadata||{}).filter(([k])=>/order/i.test(k)).map(([,v])=>/^(?:ORD-[A-Za-z0-9-]+|[a-f0-9]{24})$/.test(v)?v:"redacted")})):[]});
    }
    report.legacyOrders.push({orderId:o.orderId,date:dayKey(o.deliveryDate),createdAt:o.createdAt,paidAt:o.paidAt,
      itemUnits:(o.items||[]).reduce((n,i)=>n+Number(i.quantity||0),0),addOnUnits:(o.items||[]).filter(i=>i.isSubscriptionAddOn).reduce((n,i)=>n+Number(i.quantity||0),0),
      missingItemVariants:(o.items||[]).filter(i=>!variants.some(v=>String(v._id)===String(i.variant))).length,
      linkedSlotCount:linkedSlots.length,slotDatesMatch:linkedSlots.every(d=>dayKey(d.scheduledDate)===dayKey(o.deliveryDate)),slotStatuses:linkedSlots.map(d=>d.status),
      paymentRowCount:paymentRows.length,paymentStatuses:paymentRows.map(p=>p.status),paymentAmountMinor:Math.round(paymentRows.reduce((n,p)=>n+Number(p.amount||0),0)*100),
      orderTotalMinor:Math.round(Number(o.total||0)*100),orderPaidMinor:Math.round(Number(o.amountPaid||0)*100),
      orderPaymentMatches:Math.round(paymentRows.reduce((n,p)=>n+Number(p.amount||0),0)*100)===Math.round(Number(o.amountPaid||0)*100),
      invoiceAllocationMatches:invoice?allocations.reduce((n,a)=>n+Number(a.amountMinor||0),0)===invoice.amount_paid:false,
      peerOrders:peers.map(p=>({orderId:p.orderId,date:dayKey(p.deliveryDate),status:p.status,deliveryStatus:p.deliveryStatus,
        refunds:(p.refunds||[]).map(r=>({provider:r.provider,status:r.status,amount:r.amount,paymentIntentId:r.paymentIntentId,refundId:r.refundId||r.providerRefundId||r.stripeRefundId})),
        legacyRefund:p.refund?{amount:p.refund.amount,status:p.refund.status,provider:p.refund.provider}:null})),
      invoice:invoice?{live:invoice.livemode,status:invoice.status,currency:invoice.currency,paidMinor:invoice.amount_paid,peerOrderCount:peers.length,
        peerInvoiceAllocationMinor:allocations.reduce((n,a)=>n+Number(a.amountMinor||0),0),pendingWebhooks:invoice.webhooks_delivered_at===null}:null,intents});
  }
  stage="recent_live_event_inventory";
  const events=await pages(p=>stripe.events.list(p),{created:{gte:Math.floor(Date.now()/1000)-7*86400}});
  report.recentEvents={windowDays:7,count:events.length,byType:events.reduce((a,e)=>{a[e.type]=(a[e.type]||0)+1;return a;},{}),
    subscriptionEvents:events.filter(e=>/^(invoice\.|customer\.subscription\.)/.test(e.type)).map(e=>({id:e.id,type:e.type,createdAt:new Date(e.created*1000).toISOString(),pendingWebhooks:e.pending_webhooks,live:e.livemode})).slice(-100)};
  stage="batch_dates";
  const batches=await bounded(db.collection("deliverybatches"),{}, {deliveryDate:1,orders:1,status:1,dispatchedAt:1,completedAt:1});
  const orderMap=new Map(orders.map(o=>[String(o._id),o]));
  report.batches={count:batches.length,dateMismatches:batches.reduce((n,b)=>n+(b.orders||[]).filter(id=>{const o=orderMap.get(String(id));return !o?.deliveryDate||!b.deliveryDate||dayKey(o.deliveryDate)!==dayKey(b.deliveryDate);}).length,0)};
  report.legacyOrders.forEach(o=>{const raw=reviewOrders.find(r=>r.orderId===o.orderId);o.batchCount=batches.filter(b=>(b.orders||[]).some(id=>String(id)===String(raw._id))).length;});
  report.batchFindings=batches.flatMap(b=>(b.orders||[]).map(id=>orderMap.get(String(id))).filter(o=>!o?.deliveryDate||!b.deliveryDate||dayKey(o.deliveryDate)!==dayKey(b.deliveryDate)).map(o=>({batchDate:b.deliveryDate,batchStatus:b.status,dispatchedAt:b.dispatchedAt||null,completedAt:b.completedAt||null,recordedDeliveredAt:o?.metadata?.deliveredAt||null,deliveryProofPresent:Boolean(o?.metadata?.deliveryProofUrl),orderId:o?.orderId||null,orderDate:o?.deliveryDate||null,deliveryStatus:o?.deliveryStatus||null})));
  stage="deployment_static_inspection";
  const helperPath="/root/LWS-Scripts/05-auto-deploy.sh";
  const helper=fs.readFileSync(helperPath,"utf8");
  report.deploymentHelper={sha256:crypto.createHash("sha256").update(helper).digest("hex"),mentionsDeploySha:helper.includes("DEPLOY_SHA")};
  const scheduler=fs.readFileSync("scripts/subscriptionGeneration.scheduler.js","utf8");
  const webhookSource=fs.readFileSync("services/subscriptions/subscriptionWebhook.service.js","utf8");
  report.legacyWebhookStatic={mentionsStockQuantity:webhookSource.includes("stockQuantity"),mentionsConsumeStock:webhookSource.includes("consumeStock"),mentionsConsumptionJournal:webhookSource.includes("subscriptionStockItems"),sha256:crypto.createHash("sha256").update(webhookSource).digest("hex")};
  report.schedulerStatic={explicitLondonTimezone:scheduler.includes("timezone: SUBSCRIPTION_TIME_ZONE"),usesSchedulerLease:scheduler.includes("withSchedulerLease"),hasRecoveryAudit:scheduler.includes("auditUnresolvedSubscriptionOperations")};
  const cwd=fs.realpathSync(process.cwd());
  report.runningServerProcesses=[];
  const hostUptime=Number(fs.readFileSync("/proc/uptime","utf8").split(" ")[0]);
  for(const pid of fs.readdirSync("/proc").filter(p=>/^\d+$/.test(p))) {
    try {
      if(fs.readlinkSync(`/proc/${pid}/cwd`)!==cwd||Number(pid)===process.pid) continue;
      const comm=fs.readFileSync(`/proc/${pid}/comm`,"utf8").trim();
      if(comm!=="node") continue;
      const stat=fs.readFileSync(`/proc/${pid}/stat`,"utf8");
      const fields=stat.slice(stat.lastIndexOf(")")+2).split(" ");
      report.runningServerProcesses.push({pid:Number(pid),uptimeSeconds:Math.round(hostUptime-Number(fields[19])/100)});
    } catch (_) { /* processes may exit during a read */ }
  }
  report.recoveryTools={mongodumpPresent:fs.existsSync("/usr/bin/mongodump"),mongorestorePresent:fs.existsSync("/usr/bin/mongorestore")};
  report.backupLocations=["/root/backups","/var/backups","/root/LWS-Scripts/backups"].map(path=>{
    if(!fs.existsSync(path)) return {path,present:false};
    const entries=fs.readdirSync(path).slice(0,100).map(name=>{const s=fs.statSync(`${path}/${name}`);return {file:s.isFile(),size:s.size,modifiedAt:s.mtime.toISOString()};});
    return {path,present:true,entries};
  });
  report.logEvidence=[];
  const dumpPath="/root/.pm2/dump.pm2";
  if(fs.existsSync(dumpPath)) {
    const dump=JSON.parse(fs.readFileSync(dumpPath,"utf8"));
    for(const entry of dump.filter(e=>String(e.pm_cwd||e.pm2_env?.pm_cwd||"").includes("/Levants-server"))) {
      for(const path of [entry.pm_out_log_path,entry.pm_err_log_path,entry.pm2_env?.pm_out_log_path,entry.pm2_env?.pm_err_log_path].filter(Boolean)) {
        if(!fs.existsSync(path)) continue;
        const stat=fs.statSync(path),fd=fs.openSync(path,"r");
        const buf=Buffer.alloc(Math.min(stat.size,262144));
        try {fs.readSync(fd,buf,0,buf.length,Math.max(0,stat.size-buf.length));} finally {fs.closeSync(fd);}
        const lines=buf.toString("utf8").split("\n");
        report.logEvidence.push({modifiedAt:stat.mtime.toISOString(),sampledBytes:buf.length,
          schedulerSummaryLines:lines.filter(l=>/\[SubscriptionCron\].*Reconciled/.test(l)).length,
          schedulerErrorLines:lines.filter(l=>/\[SubscriptionCron\].*failed/i.test(l)).length,
          recoveryAlertLines:lines.filter(l=>/\[SubscriptionRecovery\]/.test(l)).length,
          webhookErrorLines:lines.filter(l=>/webhook.*(failed|error)/i.test(l)).length,
          webhookErrorClassifications:lines.flatMap((line,index)=>{
            if(!/webhook.*(failed|error)/i.test(line)) return [];
            const context=lines.slice(Math.max(0,index-2),Math.min(lines.length,index+30)).join("\n");
            const classes=[[/signature|constructEvent|No signatures found/i,"signature"],[/E11000|duplicate key/i,"duplicate_key"],[/Order not found or already processed/i,"order_missing_or_processed"],[/ValidationError|validation failed/i,"validation"],[/CastError|Cast to ObjectId/i,"cast"],[/email|resend/i,"notification"],[/stock|inventory/i,"inventory"],[/price sync/i,"price_sync"],[/re-retrieve invoice/i,"invoice_retrieval"],[/StripeInvalidRequestError|resource_missing/i,"stripe_resource"],[/MongoServerError/i,"database"],[/TypeError/i,"type_error"]].filter(([re])=>re.test(context)).map(([,label])=>label);
            const stackFunctions=[...context.matchAll(/at (?:[\w.]*\.)?([A-Za-z][A-Za-z0-9_]+) /g)].map(m=>m[1]).filter(n=>/^(Handle|resolve|sync|Promote|promote|construct|Save|save)/.test(n));
            return [{expectedPaymentDeclineNotice:/\[SubscriptionWebhook\] Payment failed for subscription .*invoice .*subscription paused/.test(line),timestamp:line.match(/\d{4}-\d{2}-\d{2}[T ][\d:.]+(?:Z|[+-][\d:]+)?/)?.[0]||null,classes:classes.length?classes:["unclassified"],stackFunctions:[...new Set(stackFunctions)],lineTokens:line.match(/[A-Za-z_]+/g)?.filter(w=>new Set("SubscriptionWebhook SubscriptionCron webhook stripe Error error failed Failed Unhandled unhandled request Request POST GET api webhooks invoice TypeError ReferenceError MongoServerError MongoServerSelectionError ValidationError CastError StripeInvalidRequestError duplicate key E errorResponse message name code stack status Cannot cannot read properties property undefined null is not a function of reading Invalid invalid Missing missing No such found processed already Payment payment Order order refund Refund price sync signature Failed validation strictPopulate Schema populate Path path timed out timeout Connection connection ECONNRESET ECONNREFUSED ETIMEDOUT transaction Transaction aborted WriteConflict SnapshotUnavailable stopped mongoose node_modules services controllers middleware logger util at HandleStripeWebhook HandleSubscriptionInvoicePaid HandlePaymentSuccess HandleRefundSucceeded Failed send email Could retrieve legacy failedInvoice".split(" ")).has(w)),
            errorNames:[...new Set(context.match(/\b[A-Za-z]+Error\b/g)||[])],
            errorCodes:[...new Set(context.match(/\b(?:E11000|ECONNRESET|ECONNREFUSED|ETIMEDOUT|WriteConflict|SnapshotUnavailable)\b/g)||[])],
            failureTemplates:[/Cannot read properties of (undefined|null)/,/([A-Za-z.]+) is not a function/,/Cannot populate path/,/No signatures found/,/Order not found or already processed/].map(re=>context.match(re)?.[0]).filter(Boolean),
            eventIds:[...new Set(context.match(/evt_[A-Za-z0-9]+/g)||[])]}];
          })});
      }
    }
  }
  report.webhookAccessEvidence=[];
  const nginxLogScopes=new Map();
  if(fs.existsSync("/etc/nginx/sites-enabled")) for(const name of fs.readdirSync("/etc/nginx/sites-enabled").slice(0,50)) {
    const path="/etc/nginx/sites-enabled/"+name;
    if(!fs.statSync(path).isFile()) continue;
    const config=fs.readFileSync(path,"utf8");
    for(const match of config.matchAll(/\bserver\s*\{/g)) {
      let end=match.index+match[0].length,depth=1;
      while(end<config.length&&depth){if(config[end]==="{")depth++;if(config[end]==="}")depth--;end++;}
      const block=config.slice(match.index,end);
      const serverNames=[...block.matchAll(/\bserver_name\s+([^;]+);/g)].flatMap(m=>m[1].split(/\s+/));
      const scopes=[...(serverNames.includes("api.levantsdairy.co.uk")?["production"]:[]),...(serverNames.includes("uat-api.levantsdairy.co.uk")?["uat"]:[])];
      for(const log of block.matchAll(/\baccess_log\s+(\/[^;\s]+)/g)) nginxLogScopes.set(log[1],[...new Set([...(nginxLogScopes.get(log[1])||[]),...scopes])]);
    }
  }
  report.alertCollectorPresence=["/etc/promtail/config.yml","/etc/vector/vector.yaml","/etc/filebeat/filebeat.yml","/etc/fluent-bit/fluent-bit.conf","/etc/datadog-agent/datadog.yaml","/etc/rsyslog.d"].map(path=>({collector:path.split("/")[2],configPresent:fs.existsSync(path)}));
  if(fs.existsSync("/var/log/nginx")) {
    for(const name of fs.readdirSync("/var/log/nginx").filter(n=>/access.*\.log$|access\.log$/.test(n)).slice(0,20)) {
      const path="/var/log/nginx/"+name;
      const stat=fs.statSync(path);if(!stat.isFile()) continue;
      const fd=fs.openSync(path,"r"),buf=Buffer.alloc(Math.min(stat.size,524288));
      try {fs.readSync(fd,buf,0,buf.length,Math.max(0,stat.size-buf.length));} finally {fs.closeSync(fd);}
      const matches=buf.toString("utf8").split("\n").filter(l=>/"POST \/api\/webhooks\/stripe(?:[ ?])/.test(l));
      report.webhookAccessEvidence.push({explicitConfiguredScopes:nginxLogScopes.get(path)||[],attributionUnproven:!(nginxLogScopes.get(path)||[]).length,sampledBytes:buf.length,modifiedAt:stat.mtime.toISOString(),webhookPosts:matches.length,
        byStatus:matches.reduce((a,l)=>{const status=l.match(/"POST [^"]+" (\d{3}) /)?.[1]||"unknown";a[status]=(a[status]||0)+1;return a;},{}),
        latest:matches.slice(-10).map(l=>({time:l.match(/\[([^\]]+)\]/)?.[1]||null,status:l.match(/"POST [^"]+" (\d{3}) /)?.[1]||null}))});
    }
  }
  stage="remaining_operational_inventory";
  const execFileSync=require("node:child_process").execFileSync;
  const relevantFiles=[];
  function readBoundedFile(path) {
    if(!fs.existsSync(path)||!fs.statSync(path).isFile()||fs.statSync(path).size>262144)return null;
    return fs.readFileSync(path,"utf8").split("\n").filter(l=>!/^\s*#/.test(l)).join("\n");
  }
  for(const path of ["/etc/crontab","/etc/rsyslog.conf","/etc/systemd/journald.conf","/etc/monit/monitrc"]) {
    const content=readBoundedFile(path);if(content!==null)relevantFiles.push({path,content});
  }
  for(const directory of ["/etc/cron.d","/var/spool/cron/crontabs","/etc/rsyslog.d"]) {
    if(!fs.existsSync(directory))continue;
    for(const name of fs.readdirSync(directory).slice(0,100)) {const path=directory+"/"+name;const content=readBoundedFile(path);if(content!==null)relevantFiles.push({path,content});}
  }
  const frameworkScripts=[];
  if(fs.existsSync("/root/LWS-Scripts"))for(const name of fs.readdirSync("/root/LWS-Scripts").filter(n=>/\.(sh|py)$/.test(n)).slice(0,100)) {
    const path="/root/LWS-Scripts/"+name;const content=readBoundedFile(path);if(content===null)continue;
    if(/backup|mongodump|mongorestore/i.test(content))frameworkScripts.push({script:name,mongoDumpMentioned:/mongodump/.test(content),mongoRestoreMentioned:/mongorestore/.test(content),offHostTransferMentioned:/rclone|restic|borg|aws\s+s3|azcopy|rsync|scp/.test(content)});
  }
  const restoreHelper=readBoundedFile("/root/LWS-Scripts/mongo-restore-from-dump.sh")||"";
  report.restoreHelperMetadata={promptsForInput:/\bread\s+-/.test(restoreHelper),credentialVariableNames:[...new Set((restoreHelper.match(/\$\{?[A-Z][A-Z0-9_]*(?:URI|PASSWORD|PASS|USER|AUTH)[A-Z0-9_]*/g)||[]).map(v=>v.replace(/^\$\{?/,"")))],backupCredentialInApplicationEnvironment:Boolean(process.env.PROD_MONGO_BACKUP_URI||process.env.MONGO_BACKUP_URI),
    databaseUserAndPasswordInEnvironment:Boolean(process.env.DB_USER&&process.env.DB_PASS),
    credentialDefinitionTypes:restoreHelper.split("\n").filter(l=>/^\s*(DB_USER|DB_PASS)=/.test(l)).map(l=>({variable:l.match(/(DB_USER|DB_PASS)=/)[1],type:l.includes("$")?"shell_expansion":/=["'][^"']+["']\s*$/.test(l)?"quoted_literal":"other"})),
    referencedEnvironmentFiles:[...new Set(restoreHelper.match(/\/(?:etc|root)\/[A-Za-z0-9_./-]+\.env\b/g)||[])]};
  report.remainingOperations={
    cronFilesInspected:relevantFiles.filter(f=>/cron/.test(f.path)).length,
    activeMongoBackupCronLines:relevantFiles.filter(f=>/cron/.test(f.path)).reduce((n,f)=>n+f.content.split("\n").filter(l=>/mongodump|mongo.*backup|backup.*mongo/i.test(l)).length,0),
    activeBackupOrMonitorCronLines:relevantFiles.filter(f=>/cron/.test(f.path)).reduce((n,f)=>n+f.content.split("\n").filter(l=>/backup|restic|borg|monitor|alert|notify/i.test(l)).length,0),
    remoteSyslogForwardingConfigured:relevantFiles.filter(f=>/rsyslog/.test(f.path)).some(f=>/omfwd|omhttp|ommail|@@?[A-Za-z0-9]/.test(f.content)),
    monitAlertConfigured:relevantFiles.filter(f=>/monit/.test(f.path)).some(f=>/\bset\s+alert\s+/i.test(f.content)),
    frameworkScripts,
    serviceStates:["rsyslog","systemd-journal-upload","monit","promtail","vector","filebeat","fluent-bit","datadog-agent","netdata","zabbix-agent"].map(name=>{let state="inactive_or_unavailable";try{state=execFileSync("systemctl",["is-active",name],{encoding:"utf8",stdio:["ignore","pipe","ignore"],timeout:3000}).trim();}catch(_){}return {service:name,state};}),
    relatedTimerCount:0,relatedTimerNames:[],backupCandidates:[]
  };
  try {const timers=execFileSync("systemctl",["list-timers","--all","--no-pager","--plain"],{encoding:"utf8",stdio:["ignore","pipe","ignore"],timeout:5000}).split("\n").filter(l=>/mongo|levants|backup|restic|borg/i.test(l));report.remainingOperations.relatedTimerCount=timers.length;report.remainingOperations.relatedTimerNames=timers.flatMap(l=>l.match(/[A-Za-z0-9_.@-]+\.timer/g)||[]);}catch(_){}
  for(const directory of ["/root","/root/backups","/var/backups","/srv/backups","/opt/backups","/root/LWS-Scripts/backups"]) {
    if(!fs.existsSync(directory))continue;
    for(const name of fs.readdirSync(directory).slice(0,200))if(/mongo|levants|\.archive(?:\.gz)?$|\.bson(?:\.gz)?$/i.test(name)) {
      const stat=fs.statSync(directory+"/"+name);report.remainingOperations.backupCandidates.push({location:directory,name,file:stat.isFile(),bytes:stat.size,modifiedAt:stat.mtime.toISOString()});
    }
  }
  const collectionNames=(await db.listCollections({}, {nameOnly:true}).toArray()).map(c=>c.name).filter(n=>/inventory|stock|audit|history/i.test(n));
  report.remainingOperations.relatedCollections=[];
  for(const name of collectionNames)report.remainingOperations.relatedCollections.push({name,count:await db.collection(name).countDocuments({},options)});
  report.completed=true;
  report.findingCount=report.indexIntegrity.filter(i=>!i.ok).length+report.indexIntegrity.reduce((n,i)=>n+i.duplicateGroups,0)+report.recovery.agedIncompleteMutations+report.recovery.invoicePlansNeedingReview+report.recovery.agedCardOperations+report.recovery.unfinishedResumes+report.stock.driftVariants+report.stock.missingVariants+report.batches.dateMismatches+report.subscriptions.reduce((n,s)=>n+s.unlinkedPaidInvoiceCount+s.duplicateLondonDates.length+s.paidOrdersMissingStockProof+s.heldDraftInvoices,0)+Number(!report.webhooks.unambiguous)+Number(selected.length===1&&report.webhooks.endpoints.find(e=>e.id===selected[0].id).missingEvents.length>0);
  report.verdict=report.findingCount?"findings_require_review":"scanned_checks_clear";
  console.log(JSON.stringify(report));
}
main().catch(e=>{console.log(JSON.stringify({readOnly:true,completed:false,failedStage:stage,errorCode:typeof e.code==="number"?e.code:undefined,reason:["environment_guard","live_key_required","bounded_read_limit","bounded_provider_limit","invoice_mode_mismatch"].includes(e.message)?e.message:"read_failed"}));process.exitCode=1;}).finally(async()=>{clearTimeout(timer);await client?.close();});
