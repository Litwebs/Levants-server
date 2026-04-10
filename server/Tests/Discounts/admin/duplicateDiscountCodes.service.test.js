const Discount = require("../../../models/discount.model");
const stripe = require("../../../utils/stripe.util");
const { CreateDiscount } = require("../../../services/discounts.admin.service");
const {
  validateDiscountForOrder,
} = require("../../../services/discounts.public.service");

describe("duplicate discount codes", () => {
  test("allows creating the same discount code more than once", async () => {
    const body = {
      name: "Spring Offer",
      code: "SPRING10",
      kind: "percent",
      percentOff: 10,
      scope: "global",
      currency: "GBP",
    };

    const first = await CreateDiscount({ body, userId: null });
    const second = await CreateDiscount({ body, userId: null });

    expect(first.success).toBe(true);
    expect(second.success).toBe(true);

    const discounts = await Discount.find({ code: "SPRING10" })
      .sort({ createdAt: 1 })
      .lean();

    expect(discounts).toHaveLength(2);
    expect(discounts[0].stripeCouponId).toBeTruthy();
    expect(discounts[1].stripeCouponId).toBeTruthy();
    expect(discounts[0].stripePromotionCodeId).toBeFalsy();
    expect(discounts[1].stripePromotionCodeId).toBeFalsy();
    expect(stripe.coupons.create).toHaveBeenCalledTimes(2);
  });

  test("uses the newest valid discount when duplicate codes exist", async () => {
    const older = await Discount.create({
      name: "Older Offer",
      code: "MULTI10",
      kind: "percent",
      percentOff: 10,
      currency: "GBP",
      scope: "global",
      isActive: true,
      stripeCouponId: "coupon_old",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    });

    const newer = await Discount.create({
      name: "Newer Offer",
      code: "MULTI10",
      kind: "percent",
      percentOff: 20,
      currency: "GBP",
      scope: "global",
      isActive: true,
      stripeCouponId: "coupon_new",
      createdAt: new Date("2026-02-01T00:00:00.000Z"),
      updatedAt: new Date("2026-02-01T00:00:00.000Z"),
    });

    const result = await validateDiscountForOrder({
      code: "MULTI10",
      customerId: "customer_1",
      resolvedItems: [
        {
          product: "product_1",
          variant: "variant_1",
          subtotal: 25,
          stripeProductId: "prod_test",
        },
      ],
    });

    expect(result.success).toBe(true);
    expect(String(result.data.discount._id)).toBe(String(newer._id));
    expect(String(result.data.discount._id)).not.toBe(String(older._id));
    expect(result.data.discountAmount).toBe(5);
  });
});
