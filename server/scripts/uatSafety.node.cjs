const { test } = require("node:test");
const assert = require("node:assert/strict");
const { validateUatEnvironment } = require("../config/uatSafety");
const fs = require("node:fs");
const { createEmailTransport } = require("../Integration/emailTransport");
const { uatStripeOptions } = require("../utils/uatStripeOptions");

function safe() {
  const values = {
    APP_ENV: "uat", LEVANTS_REQUIRE_UAT: "1", NODE_ENV: "production",
    MONGO_URI: "mongodb://levants_uat_app:example@127.0.0.1:27018/levants_uat?authSource=levants_uat&replicaSet=levants-uat",
    PORT: "5002", HOST: "127.0.0.1", EMAIL_TRANSPORT: "capture",
    UAT_EMAIL_OUTBOX: "/srv/levants-uat/shared/email-outbox", UAT_STORAGE_MODE: "disabled",
    BACKGROUND_JOBS_ENABLED: "false", STRIPE_SECRET_KEY: "sk_test_uat_disabled", STRIPE_WEBHOOKS_ENABLED: "false",
  };
  for (const name of ["JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET", "JWT_2FA_SECRET", "JWT_CUSTOMER_ACCESS_SECRET", "JWT_CUSTOMER_REFRESH_SECRET", "CREDENTIALS_MASTER_KEY"]) values[name] = "test-only-".repeat(8);
  for (const name of ["FRONTEND_URL_PROD", "CLIENT_FRONT_URL_PROD", "CUSTOMER_PORTAL_URL_PROD"]) values[name] = "https://uat-api.levantsdairy.co.uk";
  return values;
}

test("accepts dedicated UAT configuration", () => validateUatEnvironment(safe()));
test("leaves ordinary production configuration alone", () => validateUatEnvironment({ NODE_ENV: "production" }));
test("rejects wrong database, service, integration and origin settings", () => {
  const changes = {
    APP_ENV: "production", MONGO_URI: "mongodb://example@127.0.0.1:27017/production",
    PORT: "5001", HOST: "0.0.0.0", EMAIL_TRANSPORT: "resend", UAT_STORAGE_MODE: "enabled",
    BACKGROUND_JOBS_ENABLED: "true", STRIPE_SECRET_KEY: "sk_live_example", RESEND_API_KEY: "example",
    CLOUDINARY_API_SECRET: "example", FRONTEND_URL_PROD: "https://api.levantsdairy.co.uk", JWT_ACCESS_SECRET: "short",
  };
  for (const [name, value] of Object.entries(changes)) {
    assert.throws(() => validateUatEnvironment({ ...safe(), [name]: value }), /UAT|requires/, name);
  }
});

test("UAT captures individual and batch messages without loading an email provider", async (t) => {
  const original = { ...process.env };
  t.after(() => { process.env = original; });
  process.env.APP_ENV = "uat";
  process.env.EMAIL_TRANSPORT = "capture";
  process.env.UAT_EMAIL_OUTBOX = "/srv/levants-uat/shared/email-outbox";
  t.mock.method(fs, "mkdirSync", () => {});
  t.mock.method(fs, "readdirSync", () => []);
  const writes = [];
  t.mock.method(fs, "writeFileSync", (file, content, options) => writes.push({ file, content, options }));
  const transport = createEmailTransport();
  await transport.emails.send({ to: "synthetic@example.invalid", subject: "test" });
  const batch = await transport.batch.send([{ to: "synthetic@example.invalid" }]);
  assert.equal(batch.data.length, 1);
  assert.equal(writes.length, 2);
  assert.equal(writes[0].options.mode, 0o600);
  assert.equal(JSON.parse(writes[0].content).subject, "test");
  process.env.UAT_EMAIL_OUTBOX = "/tmp/unsafe";
  await assert.rejects(transport.emails.send({}), /Invalid UAT outbox/);
});

test("UAT payment transport refuses provider requests", async (t) => {
  const original = process.env.APP_ENV;
  t.after(() => { if (original === undefined) delete process.env.APP_ENV; else process.env.APP_ENV = original; });
  process.env.APP_ENV = "uat";
  await assert.rejects(uatStripeOptions().httpClient.makeRequest(), /Payments are disabled/);
  process.env.APP_ENV = "production";
  assert.deepEqual(uatStripeOptions(), {});
});


test("sandbox mode accepts test credentials and rejects live or incomplete credentials", () => {
  const values = { ...safe(), UAT_STRIPE_MODE: "test", STRIPE_SECRET_KEY: "sk_test_example123",
    STRIPE_PUBLISHABLE_KEY: "pk_test_example123", STRIPE_WEBHOOK_SECRET: "whsec_example123", STRIPE_WEBHOOKS_ENABLED: "true" };
  validateUatEnvironment(values);
  for (const changes of [{STRIPE_SECRET_KEY:"sk_live_example"}, {STRIPE_PUBLISHABLE_KEY:"pk_live_example"},
    {STRIPE_WEBHOOK_SECRET:""}, {STRIPE_WEBHOOKS_ENABLED:"false"}, {UAT_STRIPE_MODE:"live"}]) {
    assert.throws(() => validateUatEnvironment({...values, ...changes}), /UAT safety/);
  }
});

test("sandbox transport rejects live keys", (t) => {
  const original = {...process.env};
  t.after(() => { process.env = original; });
  process.env.APP_ENV = "uat";
  process.env.UAT_STRIPE_MODE = "test";
  process.env.STRIPE_SECRET_KEY = "sk_test_example123";
  assert.equal(uatStripeOptions().httpClient, undefined);
  process.env.STRIPE_SECRET_KEY = "sk_live_example123";
  assert.throws(() => uatStripeOptions(), /sandbox key/);
});

test("UAT webhook rejects disabled, live and unsigned events before business handlers", async (t) => {
  const vm = require("node:vm");
  const original = {...process.env};
  t.after(() => { process.env = original; });
  process.env.APP_ENV = "uat";
  process.env.UAT_STRIPE_MODE = "test";
  process.env.STRIPE_WEBHOOKS_ENABLED = "true";
  let event = {type:"unhandled.test",livemode:true};
  let calls = 0;
  const sandbox = {process, module:{exports:{}}, require: name => {
    if (name.includes("stripe.util")) return {webhooks:{constructEvent: () => { calls++; if (!event) throw new Error("Invalid signature"); return event; }}};
    return new Proxy({}, {get: () => () => { throw new Error("Business handler must not run"); }});
  }};
  vm.runInNewContext(fs.readFileSync(require.resolve("../controllers/stripe.webhook.controller"), "utf8"), sandbox);
  const handle = sandbox.module.exports.HandleStripeWebhook;
  const response = () => ({code:200,status(code){this.code=code;return this;},json(){return this;},send(){return this;}});
  const req = {headers:{"stripe-signature":"synthetic"},body:Buffer.from("{}")} ;
  let res = response(); await handle(req,res); assert.equal(res.code,400);
  event = null; res = response(); await handle(req,res); assert.equal(res.code,400);
  event = {type:"unhandled.test",livemode:false}; res=response(); await handle(req,res); assert.equal(res.code,200);
  process.env.STRIPE_WEBHOOKS_ENABLED="false"; const before=calls;
  res=response(); await handle(req,res); assert.equal(res.code,503); assert.equal(calls,before);
});


test("UAT Resend labels single and batch mail and preserves unrestricted recipients", (t) => {
  const vm = require("node:vm");
  const original = {...process.env}; t.after(() => {process.env=original;});
  process.env.APP_ENV="uat"; process.env.EMAIL_TRANSPORT="resend"; process.env.RESEND_EMAIL_KEY="re_testOnly";
  const sends=[]; const batches=[];
  const sandbox={process,module:{exports:{}},require:name => {
    if (name==="resend") return {Resend:class {constructor(){this.emails={send:p=>sends.push(p)};this.batch={send:p=>batches.push(p)};}}};
    return require(name);
  }};
  vm.runInNewContext(fs.readFileSync(require.resolve("../Integration/emailTransport"),"utf8"),sandbox);
  const transport=sandbox.module.exports.createEmailTransport();
  transport.emails.send({from:"production@example.com",to:"anyone@example.com",cc:["other@example.com"],subject:"Receipt",html:"<p>Test</p>"});
  transport.batch.send([{to:"third@example.com",subject:"[UAT] Already marked"}]);
  assert.equal(sends[0].from,"Levants UAT <no-reply@levantsdairy.co.uk>");
  assert.equal(sends[0].subject,"[UAT] Receipt");
  assert.equal(sends[0].to,"anyone@example.com"); assert.equal(sends[0].cc[0],"other@example.com");
  assert.equal(batches[0][0].subject,"[UAT] Already marked");
  validateUatEnvironment({...safe(),EMAIL_TRANSPORT:"resend",RESEND_EMAIL_KEY:"re_testOnly"});
  assert.throws(()=>validateUatEnvironment({...safe(),EMAIL_TRANSPORT:"resend"}),/separate Resend key/);
});


test("UAT Cloudinary cannot overwrite or delete production assets", async () => {
  const {createUatCloudinary} = require("../utils/uatCloudinary");
  const uploads=[],deletes=[],batches=[];
  const provider={uploader:{upload:async(file,options)=>{uploads.push(options);return {public_id:options.folder+"/"+options.public_id};},destroy:async(...args)=>deletes.push(args)},api:{delete_resources:async(...args)=>batches.push(args)}};
  const client=createUatCloudinary(provider);
  const asset=await client.uploader.upload("synthetic",{folder:"litwebs/products",public_id:"production",overwrite:true,upload_preset:"unsafe",api_key:"different",resource_type:"image"});
  assert.match(asset.public_id,/^levants-uat\/litwebs\/products\/[a-f0-9-]+$/);
  assert.equal(uploads[0].overwrite,false); assert.equal(uploads[0].upload_preset,undefined); assert.equal(uploads[0].api_key,undefined);
  for(const id of ["production/image","levants-uat-other/image","levants-uat/../production","levants-uat/%2e%2e/image","levants-uat/",null]) {
    await assert.rejects(client.uploader.destroy(id),/outside/);
    await assert.rejects(client.api.delete_resources([asset.public_id,id]),/outside/);
  }
  assert.equal(deletes.length,0);assert.equal(batches.length,0);
  await assert.rejects(client.uploader.upload("synthetic",{folder:"../production"}),/outside/);
  assert.equal(uploads.length,1);
  await client.uploader.destroy(asset.public_id,{public_ids:["production/image"]});
  await client.api.delete_resources([asset.public_id]);
  assert.equal(deletes.length,1);assert.equal(batches.length,1);
  assert.equal(client.api.delete_all_resources,undefined);
  validateUatEnvironment({...safe(),UAT_STORAGE_MODE:"cloudinary",CLOUDINARY_CLOUD_NAME:"example",CLOUDINARY_API_KEY:"123456789",CLOUDINARY_API_SECRET:"testOnly"});
  assert.throws(()=>validateUatEnvironment({...safe(),UAT_STORAGE_MODE:"cloudinary"}),/Cloudinary/);
});


test("UAT Google uses its protected credential copy and disabled calls make no requests", async (t) => {
  const vm=require("node:vm");const original={...process.env};t.after(()=>{process.env=original;});
  process.env.APP_ENV="uat";process.env.UAT_GOOGLE_MODE="disabled";
  let authOptions; let requests=0;
  function load(file) {
    const sandbox={process,module:{exports:{}},require:name=>{
      if(name==="axios") return {get:()=>{requests++;},post:()=>{requests++;}};
      if(name==="google-auth-library") return {GoogleAuth:class {constructor(options){authOptions=options;}getClient(){throw new Error("Must not authenticate while disabled");}}};
      return require(name);
    }};
    vm.runInNewContext(fs.readFileSync(require.resolve(file),"utf8"),sandbox);return sandbox.module.exports;
  }
  await assert.rejects(load("../Integration/google.geocode").geocodeAddress({}),/disabled/);
  await assert.rejects(load("../services/googleRoute.service").optimizeRoutes({}),/disabled/);
  assert.equal(requests,0);assert.equal(authOptions.keyFile,"/etc/levants-uat/google-service-account.json");
  const settings={...safe(),UAT_GOOGLE_MODE:"enabled",GOOGLE_MAPS_API_KEY:"testKey",GOOGLE_PROJECT_ID:"test-project-123",GOOGLE_APPLICATION_CREDENTIALS:"/etc/levants-uat/google-service-account.json"};
  validateUatEnvironment(settings);
  assert.throws(()=>validateUatEnvironment({...settings,GOOGLE_APPLICATION_CREDENTIALS:"/root/production.json"}),/protected UAT copy/);
  assert.throws(()=>validateUatEnvironment({...settings,GOOGLE_MAPS_API_KEY:""}),/Google settings/);
});
