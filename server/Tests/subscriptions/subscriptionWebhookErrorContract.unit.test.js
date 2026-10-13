"use strict";
const errorHandler = require("../../middleware/error.middleware");

test("the production HTTP response preserves the retry code without exposing server errors", () => {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  const logged = jest.spyOn(console, "error").mockImplementation(() => {});
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  try {
    errorHandler(Object.assign(new Error("Subscription lifecycle is busy or not ready; retry this webhook."), {
      statusCode: 503, code: "SUBSCRIPTION_LIFECYCLE_BUSY",
    }), {}, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({
      success: false, message: "Something went wrong, please try again later.", data: null,
      error: { code: "SUBSCRIPTION_LIFECYCLE_BUSY" },
    });
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
    logged.mockRestore();
  }
});
