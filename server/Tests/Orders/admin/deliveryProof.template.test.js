const deliveryProof = require("../../../Templates/deliveryProof");

describe("delivery proof email template", () => {
  test("uses an inline content ID when one is provided", () => {
    const html = deliveryProof({
      orderId: "ORD-123",
      proofUrl: "https://cdn.example.com/proof.jpg",
      proofSrc: "cid:delivery-proof-photo",
    });

    expect(html).toContain('src="cid:delivery-proof-photo"');
    expect(html).not.toContain('src="https://cdn.example.com/proof.jpg"');
  });

  test("keeps remote URL rendering as a fallback", () => {
    const html = deliveryProof({
      orderId: "ORD-123",
      proofUrl: "https://cdn.example.com/proof.jpg",
    });

    expect(html).toContain('src="https://cdn.example.com/proof.jpg"');
  });
});
