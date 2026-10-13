// This scenario gate must never use a developer's real Resend credentials.
jest.mock("../../../Integration/emailTransport", () => ({
  createEmailTransport: () => ({
    emails: {
      send: jest.fn(async () => ({ data: { id: "basket-test-email" } })),
      get: jest.fn(async (id) => ({ data: { id, last_event: "delivered" } })),
    },
    batch: { send: jest.fn(async (messages) => ({ data: messages.map((_, i) => ({ id: `basket-test-email-${i}` })) })) },
  }),
}));
