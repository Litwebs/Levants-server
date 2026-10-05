const jwt = require("jsonwebtoken");
const jwtUtil = require("../../utils/jwt.util");
const mongoose = require("mongoose");
const principal = {
  _id: new mongoose.Types.ObjectId(),
  role: { name: "admin" },
};

test("normal admin and customer access tokens retain their intended access", () => {
  expect(
    jwtUtil.verifyAccessToken(jwtUtil.signAccessToken(principal)).sub,
  ).toBe(String(principal._id));
  expect(
    jwtUtil.verifyCustomerAccessToken(
      jwtUtil.signCustomerAccessToken(principal),
    ).sub,
  ).toBe(String(principal._id));
  expect(
    jwtUtil.verify2FATempToken(jwtUtil.sign2FATempToken(principal)).tokenType,
  ).toBe("2fa");
});
test.each([
  { tokenType: "2fa" },
  { tokenType: "refresh" },
  { type: "customer" },
])(
  "admin access rejects a different token purpose signed with its own secret: %j",
  (claims) => {
    const token = jwt.sign(
      { sub: String(principal._id), ...claims },
      process.env.JWT_ACCESS_SECRET,
      { expiresIn: "15m" },
    );
    expect(() => jwtUtil.verifyAccessToken(token)).toThrow(/token type/);
  },
);
test("customer refresh tokens cannot serve as access tokens even with the same signing secret", () => {
  const secret =
    process.env.JWT_CUSTOMER_ACCESS_SECRET || process.env.JWT_ACCESS_SECRET;
  const token = jwt.sign(
    {
      sub: String(principal._id),
      type: "customer",
      tokenType: "refresh",
      sid: "session",
    },
    secret,
    { expiresIn: "15m" },
  );
  expect(() => jwtUtil.verifyCustomerAccessToken(token)).toThrow(/token type/);
});
