const request = require("supertest");
const app = require("../../testApp");

describe("POST /api/delivery/check (PUBLIC)", () => {
  test("returns deliverable=true for covered outward codes", async () => {
    const res = await request(app)
      .post("/api/delivery/check")
      .send({ postcode: "bd5 0al" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.outwardCode).toBe("BD5");
    expect(res.body.data.deliverable).toBe(true);
  });

  test("returns deliverable=false for non-covered outward codes", async () => {
    const res = await request(app)
      .post("/api/delivery/check")
      .send({ postcode: "BD17 1AA" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.outwardCode).toBe("BD17");
    expect(res.body.data.deliverable).toBe(false);
  });

  test("accepts outward-only inputs (WF17)", async () => {
    const res = await request(app)
      .post("/api/delivery/check")
      .send({ postcode: "wf17" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.outwardCode).toBe("WF17");
    expect(res.body.data.deliverable).toBe(true);
  });

  test("accepts outward-only inputs (LS28)", async () => {
    const res = await request(app)
      .post("/api/delivery/check")
      .send({ postcode: "LS28" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.outwardCode).toBe("LS28");
    expect(res.body.data.deliverable).toBe(true);
  });

  test("parses full postcodes for covered outward codes (WF17)", async () => {
    const res = await request(app)
      .post("/api/delivery/check")
      .send({ postcode: "WF17 0AL" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.outwardCode).toBe("WF17");
    expect(res.body.data.deliverable).toBe(true);
  });

  test("validates body input", async () => {
    const res = await request(app).post("/api/delivery/check").send({});
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});
