const {
  applyEmailBranding,
  withBusinessTemplateParams,
} = require("../../services/emailBranding.service");
const mongoose = require("mongoose");
const BusinessInfo = require("../../models/businessInfo.model");
const File = require("../../models/file.model");
const sendEmail = require("../../Integration/Email.service");

describe("email business branding", () => {
  const branding = {
    companyName: "Farm & Field",
    email: "hello@farm-and-field.test",
    phone: "+44 7000 000000",
    address: "1 Farm Lane",
    logoSrc: "https://cdn.example.com/admin-logo.png",
  };

  test("overrides legacy template logos and business identity", () => {
    const html = `
      <img src="https://legacy.example/logo.png" alt="Levants" />
      <p>Levants Dairy</p>
      <a href="mailto:levantsdairy1@gmail.com">levantsdairy1@gmail.com</a>
    `;

    const branded = applyEmailBranding(html, branding, branding.logoSrc);

    expect(branded).toContain(
      'src="https://cdn.example.com/admin-logo.png"',
    );
    expect(branded).toContain("Farm &amp; Field");
    expect(branded).toContain("hello@farm-and-field.test");
    expect(branded).not.toContain("legacy.example");
  });

  test("adds all business details to template parameters", () => {
    expect(withBusinessTemplateParams({ orderId: "1" }, branding, "logo")).toEqual(
      {
        orderId: "1",
        logoSrc: "logo",
        companyName: "Farm & Field",
        businessEmail: "hello@farm-and-field.test",
        businessPhone: "+44 7000 000000",
        businessAddress: "1 Farm Lane",
      },
    );
  });

  test("outgoing emails resolve branding from the dashboard record", async () => {
    const logo = await File.create({
      originalName: "email-logo.png",
      filename: `test/email-logo-${Date.now()}`,
      mimeType: "image/png",
      sizeBytes: 100,
      url: "https://cdn.example.com/dashboard-logo.png",
      uploadedBy: new mongoose.Types.ObjectId(),
    });
    await BusinessInfo.findOneAndUpdate(
      { singletonKey: "business-info" },
      {
        companyName: "Dashboard Dairy",
        email: "hello@dashboard-dairy.test",
        logo: logo._id,
      },
    );

    const previousCaptureSetting = process.env.E2E_CAPTURE_EMAILS;
    process.env.E2E_CAPTURE_EMAILS = "1";
    global.__E2E_EMAIL_OUTBOX__ = [];

    try {
      const result = await sendEmail(
        "customer@example.test",
        "Reset password",
        "resetPassword",
        { name: "Customer", resetLink: "https://example.test/reset" },
      );

      expect(result.success).toBe(true);
      const captured = global.__E2E_EMAIL_OUTBOX__[0];
      expect(captured.from).toBe(
        "Dashboard Dairy <no-reply@levantsdairy.co.uk>",
      );
      expect(captured.reply_to).toBe("hello@dashboard-dairy.test");
      expect(captured.html).toContain(
        'src="https://cdn.example.com/dashboard-logo.png"',
      );
      expect(captured.html).toContain("Dashboard Dairy");
    } finally {
      if (previousCaptureSetting === undefined) {
        delete process.env.E2E_CAPTURE_EMAILS;
      } else {
        process.env.E2E_CAPTURE_EMAILS = previousCaptureSetting;
      }
      delete global.__E2E_EMAIL_OUTBOX__;
    }
  });
});
