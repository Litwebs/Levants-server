const request = require("supertest");
const mongoose = require("mongoose");
const app = require("../testApp");
const Deal = require("../../models/deal.model");
const Order = require("../../models/order.model");
const Variant = require("../../models/variant.model");
const { createDeal } = require("../../services/deals.admin.service");
const { createUser } = require("../helpers/authTestData");
const { getSetCookieHeader } = require("../helpers/cookies");
const { createProduct, createVariant, createCustomer } = require("../Orders/helpers/orderFactory");

async function adminCookie() {
  const user = await createUser({role:"admin"});
  return getSetCookieHeader(await request(app).post("/api/auth/login").send({email:user.email,password:"secret123"}));
}
async function fixture() {
  const product = await createProduct();
  const variant = await createVariant({product,stock:20,price:5});
  return {product,variant,body:{name:"Milk offer",items:[{variantId:String(variant._id),quantity:1}],packagePrice:3}};
}

describe("deal hardening on the current application", () => {
  test("admin can create a single-product offer with no expiry and customers can discover it", async () => {
    const {body} = await fixture();
    const created = await request(app).post("/api/admin/deals").set("Cookie",await adminCookie()).send(body);
    expect(created.status).toBe(201);
    expect(created.body.data.deal.endsAt).toBeNull();
    const listed = await request(app).get("/api/deals");
    expect(listed.body.data.deals).toEqual([expect.objectContaining({name:"Milk offer",packagePrice:3,savings:2})]);
  });

  test.each(["data:image/svg+xml;base64,PHN2Zz4=", "data:image/png;base64,AAAA", "data:image/png;base64," + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>').toString("base64")])("rejects unsafe or corrupt image %s without creating a deal", async (image) => {
    const {body} = await fixture();
    const res = await request(app).post("/api/admin/deals").set("Cookie",await adminCookie()).send({...body,image});
    expect(res.status).toBe(400);
    expect(await Deal.countDocuments()).toBe(0);
  });

  test("rejects a missing managed image reference", async () => {
    const {body} = await fixture();
    const result = await createDeal({body:{...body,image:String(new mongoose.Types.ObjectId())}});
    expect(result.statusCode).toBe(400);
    expect(await Deal.countDocuments()).toBe(0);
  });

  test("simultaneous duplicate slugs return one success and one conflict", async () => {
    const {body} = await fixture();
    const results = await Promise.all([createDeal({body}),createDeal({body})]);
    expect(results.filter((result) => result.success)).toHaveLength(1);
    expect(results.find((result) => !result.success).statusCode).toBe(409);
    expect(await Deal.countDocuments()).toBe(1);
  });

  test("changed contents are rejected and stock reservations roll back", async () => {
    const {body,variant} = await fixture();
    const customer = await createCustomer();
    const created = await createDeal({body});
    const res = await request(app).post("/api/orders").send({
      customerId:String(customer._id),items:[{variantId:String(variant._id),quantity:2}],
      deals:[{dealId:String(created.data.deal._id),quantity:1,expectedPackagePrice:3,expectedContents:[{variantId:String(variant._id),quantity:2}]}],
      deliveryAddress:{line1:"1 Test Street",city:"Bradford",postcode:"BD1 1AA",country:"GB"},
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/products have changed/i);
    expect(await Order.countDocuments()).toBe(0);
    expect((await Variant.findById(variant._id)).reservedQuantity).toBe(0);
  });

  test("deal product picker supports browsing and excludes unpublished products", async () => {
    const {product} = await fixture();
    const inactive = await createProduct();
    inactive.status = "draft"; await inactive.save();
    await createVariant({product:inactive,stock:20,price:5});
    const cookie = await adminCookie();
    const res = await request(app).get("/api/admin/deals/catalog?pageSize=1").set("Cookie",cookie);
    expect(res.status).toBe(200);
    expect(res.body.data.pagination.total).toBe(1);
    expect(res.body.data.variants[0].product.name).toBe(product.name);
    expect(res.body.data.variants[0].availableQuantity).toBe(20);
    expect((await request(app).get("/api/admin/deals/catalog")).status).toBe(401);
  });
});
