const {
  resolvePreviewHtml,
} = require("../../../services/orders/orders.email-audit.service");

describe("order email audit preview", () => {
  it("resolves the delivery proof CID to the stored browser URL", () => {
    const proofUrl = "https://cdn.example.test/delivery/proof.jpg";
    const html = '<img src="cid:delivery-proof-photo" alt="Delivery proof">';

    expect(resolvePreviewHtml(html, proofUrl)).toBe(
      `<img src="${proofUrl}" alt="Delivery proof">`,
    );
  });

  it("leaves the email HTML unchanged when no proof URL is stored", () => {
    const html = '<img src="cid:delivery-proof-photo" alt="Delivery proof">';

    expect(resolvePreviewHtml(html, "")).toBe(html);
  });
});
