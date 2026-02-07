// Tests/__mocks__/stripe.js
module.exports = {
  products: {
    create: jest.fn().mockResolvedValue({ id: "prod_test_123" }),
    update: jest.fn().mockResolvedValue({ id: "prod_test_123" }),
  },
  prices: {
    create: jest.fn().mockResolvedValue({ id: "price_test_123" }),
  },
};
