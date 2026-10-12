jest.mock("../../utils/jwt.util", () => ({ verifyAccessToken: jest.fn() }));
jest.mock("../../middleware/auth.middleware", () => ({ requireAuth: jest.fn() }));

const { verifyAccessToken } = require("../../utils/jwt.util");
const { requireAuth } = require("../../middleware/auth.middleware");
const { requireDealsAdminAuth } = require("../../middleware/deals.auth.middleware");

describe("Deals / administrator token purpose", () => {
  beforeEach(() => jest.resetAllMocks());

  test.each([
    { type: "customer" },
    { tokenType: "2fa" },
    { tokenType: "refresh" },
    { type: "customer", tokenType: "access" },
    { tokenType: "unknown" },
  ])("rejects a correctly signed token with non-admin purpose %j", payload => {
    verifyAccessToken.mockReturnValue({ sub: "admin-id", ...payload });
    const next = jest.fn();
    requireDealsAdminAuth({ headers: { authorization: "Bearer signed" } }, {}, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
    expect(requireAuth).not.toHaveBeenCalled();
  });

  test.each([{}, { type: "admin", tokenType: "access" }])("delegates admin access %j to unchanged UAT account checks", payload => {
    verifyAccessToken.mockReturnValue({ sub: "admin-id", ...payload });
    const req = { headers: { authorization: "Bearer signed" } };
    const res = {};
    const next = jest.fn();
    requireDealsAdminAuth(req, res, next);
    expect(requireAuth).toHaveBeenCalledWith(req, res, next);
  });

  test("uses the same cookie precedence as UAT authentication", () => {
    verifyAccessToken.mockReturnValue({ type: "customer" });
    const next = jest.fn();
    requireDealsAdminAuth({ cookies: { accessToken: "customer-cookie" }, headers: { authorization: "Bearer admin-header" } }, {}, next);
    expect(verifyAccessToken).toHaveBeenCalledWith("customer-cookie");
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
  });

  test("rejects invalid or expired signatures", () => {
    verifyAccessToken.mockImplementation(() => { throw new Error("expired"); });
    const next = jest.fn();
    requireDealsAdminAuth({ headers: { authorization: "Bearer expired" } }, {}, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
    expect(requireAuth).not.toHaveBeenCalled();
  });

  test("delegates missing tokens to UAT's authentication-required response", () => {
    const req = { headers: {} };
    const next = jest.fn();
    requireDealsAdminAuth(req, {}, next);
    expect(verifyAccessToken).not.toHaveBeenCalled();
    expect(requireAuth).toHaveBeenCalledWith(req, expect.any(Object), next);
  });
});
