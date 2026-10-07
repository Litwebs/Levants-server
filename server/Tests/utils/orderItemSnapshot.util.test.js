const {
  getProductNameMap,
  attachProductNameSnapshots,
} = require("../../utils/orderItemSnapshot.util");
const { createProduct } = require("../Orders/helpers/orderFactory");

describe("orderItemSnapshot.util", () => {
  test("attaches product-name snapshots and preserves existing snapshots", async () => {
    const product = await createProduct({ name: "Snapshot Product" });
    const existing = await createProduct({ name: "Current Name" });

    const items = [
      { product: product._id },
      { product: existing._id, productName: "Historical Name" },
    ];

    await attachProductNameSnapshots(items);

    expect(items).toEqual([
      expect.objectContaining({ productName: "Snapshot Product" }),
      expect.objectContaining({ productName: "Historical Name" }),
    ]);

    const map = await getProductNameMap([product._id, product._id]);
    expect(map.size).toBe(1);
    expect(map.get(String(product._id))).toBe("Snapshot Product");
  });
});
