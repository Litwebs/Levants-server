"use strict";

const ordersService = require("../../services/customerPortal/customerOrders.service");
const businessInfoService = require("../../services/businessInfo.service");
const { sendOk, sendCreated, sendErr } = require("../../utils/response.util");

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");

const formatMoney = (amount, currency = "GBP") =>
  new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
  }).format(Number(amount || 0));

const formatDateTime = (value) => {
  if (!value) return "-";
  return new Date(value).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatStatus = (value) =>
  String(value || "unknown")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (m) => m.toUpperCase());

async function resolveBusinessProfile() {
  let business = null;
  try {
    const result = await businessInfoService.getBusinessInfo();
    if (!result?.error && result?.data) {
      business = result.data;
    }
  } catch {
    business = null;
  }

  return {
    companyName:
      business?.companyName || process.env.BUSINESS_NAME || "Levants Dairy",
    supportEmail: business?.email || process.env.BUSINESS_EMAIL || "",
    supportPhone: business?.phone || process.env.BUSINESS_PHONE || "",
    registeredAddress:
      business?.address ||
      process.env.BUSINESS_ADDRESS ||
      "Address unavailable",
    billingAddress:
      process.env.BUSINESS_BILLING_ADDRESS ||
      business?.address ||
      "Address unavailable",
    companyNumber:
      process.env.BUSINESS_COMPANY_NUMBER || process.env.COMPANY_NUMBER || "",
    vatNumber: process.env.BUSINESS_VAT_NUMBER || process.env.VAT_NUMBER || "",
  };
}

function buildReceiptHtml(order, businessProfile) {
  const customerName = [
    order?.customerDetails?.firstName,
    order?.customerDetails?.lastName,
  ]
    .filter(Boolean)
    .join(" ")
    .trim();

  const address = [
    order?.deliveryAddress?.line1,
    order?.deliveryAddress?.line2,
    order?.deliveryAddress?.city,
    order?.deliveryAddress?.postcode,
    order?.deliveryAddress?.country,
  ]
    .filter(Boolean)
    .join(", ");

  const rows = (order.items || [])
    .map(
      (item) => `
        <tr>
          <td>${escapeHtml(item.name)}</td>
          <td>${escapeHtml(item.sku)}</td>
          <td>${escapeHtml(item.quantity)}</td>
          <td>${escapeHtml(formatMoney(item.price, order.currency || "GBP"))}</td>
          <td>${escapeHtml(formatMoney(item.subtotal, order.currency || "GBP"))}</td>
        </tr>
      `,
    )
    .join("");

  const refundRows = (order.refunds || [])
    .map(
      (refund) => `
        <tr>
          <td>${escapeHtml(formatDateTime(refund.refundedAt || refund.createdAt))}</td>
          <td>${escapeHtml(formatStatus(refund.status || "pending"))}</td>
          <td>${escapeHtml(formatMoney(refund.amount || 0, refund.currency || order.currency || "GBP"))}</td>
          <td>${escapeHtml(refund.reason || "-")}</td>
        </tr>
      `,
    )
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Receipt ${escapeHtml(order.orderId)}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Playfair+Display:wght@600;700&display=swap');
    :root {
      --forest: hsl(150 35% 28%);
      --forest-soft: hsl(150 25% 92%);
      --cream: hsl(40 33% 98%);
      --ink: hsl(30 10% 15%);
      --muted: hsl(30 10% 45%);
      --line: hsl(35 20% 88%);
      --gold: hsl(42 85% 55%);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 28px;
      background: radial-gradient(1200px 400px at 10% -10%, hsl(150 40% 96%), transparent), var(--cream);
      color: var(--ink);
      font-family: "DM Sans", system-ui, sans-serif;
    }
    .sheet {
      max-width: 960px;
      margin: 0 auto;
      background: #fff;
      border: 1px solid var(--line);
      border-radius: 20px;
      overflow: hidden;
      box-shadow: 0 18px 40px -28px hsl(30 10% 15% / 0.35);
    }
    .hero {
      background: linear-gradient(135deg, hsl(150 35% 28%), hsl(150 40% 22%));
      color: #fff;
      padding: 24px 28px;
      display: flex;
      justify-content: space-between;
      gap: 20px;
      align-items: flex-start;
    }
    .brand {
      font-family: "Playfair Display", Georgia, serif;
      font-size: 30px;
      line-height: 1.05;
      margin: 0;
      letter-spacing: 0.01em;
    }
    .hero-meta { font-size: 13px; opacity: 0.9; margin-top: 8px; }
    .hero-right { text-align: right; min-width: 220px; }
    .pill {
      display: inline-block;
      background: hsl(42 85% 55% / 0.2);
      border: 1px solid hsl(42 85% 55% / 0.35);
      color: #fff;
      border-radius: 999px;
      padding: 4px 10px;
      font-size: 11px;
      letter-spacing: .08em;
      text-transform: uppercase;
      font-weight: 700;
      margin-bottom: 8px;
    }
    .content { padding: 22px 28px 26px; }
    .toolbar { display: flex; justify-content: flex-end; margin-bottom: 14px; }
    .btn {
      border: 1px solid var(--line);
      background: #fff;
      border-radius: 10px;
      padding: 8px 12px;
      font-size: 13px;
      cursor: pointer;
      color: var(--ink);
      font-family: inherit;
    }
    .cards {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 14px;
      margin-bottom: 18px;
    }
    .card {
      border: 1px solid var(--line);
      border-radius: 14px;
      padding: 12px;
      background: #fff;
    }
    .label {
      text-transform: uppercase;
      letter-spacing: .08em;
      color: var(--muted);
      font-size: 11px;
      margin-bottom: 4px;
      font-weight: 600;
    }
    .heading {
      font-family: "Playfair Display", Georgia, serif;
      font-size: 22px;
      margin: 6px 0 10px;
    }
    .subheading {
      font-family: "Playfair Display", Georgia, serif;
      font-size: 18px;
      margin: 22px 0 10px;
    }
    .muted { color: var(--muted); font-size: 13px; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    th, td { border-bottom: 1px solid var(--line); text-align: left; padding: 10px 6px; font-size: 13px; }
    th { font-size: 11px; text-transform: uppercase; letter-spacing: .08em; color: var(--muted); font-weight: 700; }
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
    .totals { margin-top: 14px; max-width: 420px; margin-left: auto; border: 1px solid var(--line); border-radius: 12px; padding: 12px; background: var(--forest-soft); }
    .totals div { display: flex; justify-content: space-between; padding: 4px 0; font-size: 14px; }
    .totals .final { border-top: 1px solid hsl(150 20% 75%); margin-top: 6px; padding-top: 8px; font-weight: 700; color: var(--forest); }
    .footer-note {
      margin-top: 16px;
      font-size: 12px;
      color: var(--muted);
      border-top: 1px dashed var(--line);
      padding-top: 10px;
    }
    @media (max-width: 860px) {
      body { padding: 10px; }
      .hero { flex-direction: column; }
      .hero-right { text-align: left; }
      .cards { grid-template-columns: 1fr; }
      .content { padding: 16px; }
    }
    @media print {
      body { background: #fff; padding: 0; }
      .sheet { border: none; border-radius: 0; box-shadow: none; }
      .toolbar { display: none; }
    }
  </style>
</head>
<body>
  <div class="sheet">
    <div class="hero">
      <div>
        <h1 class="brand">${escapeHtml(businessProfile.companyName)}</h1>
        <div class="hero-meta">Premium dairy order receipt</div>
      </div>
      <div class="hero-right">
        <div class="pill">Receipt</div>
        <div class="mono">${escapeHtml(order.orderId)}</div>
        <div class="hero-meta">Generated ${escapeHtml(formatDateTime(new Date()))}</div>
      </div>
    </div>

    <div class="content">
      <div class="toolbar">
        <button id="printBtn" type="button" class="btn">Print / Save PDF</button>
      </div>

      <div class="cards">
        <div class="card">
          <div class="label">Billed To</div>
          <div>${escapeHtml(customerName || "-")}</div>
          <div class="muted">${escapeHtml(order?.customerDetails?.email || "")}</div>
          <div class="muted">${escapeHtml(order?.customerDetails?.phone || "")}</div>
        </div>
        <div class="card">
          <div class="label">Billing Address</div>
          <div>${escapeHtml(address || "-")}</div>
        </div>
        <div class="card">
          <div class="label">Seller</div>
          <div>${escapeHtml(businessProfile.companyName)}</div>
          <div class="muted">${escapeHtml(businessProfile.registeredAddress)}</div>
          <div class="muted">${escapeHtml(businessProfile.supportEmail)}</div>
        </div>
        <div class="card">
          <div class="label">Business Fields</div>
          <div>Company No: ${escapeHtml(businessProfile.companyNumber || "-")}</div>
          <div>VAT No: ${escapeHtml(businessProfile.vatNumber || "-")}</div>
          <div class="muted">Payment Status: ${escapeHtml(formatStatus(order.status))}</div>
          <div class="muted">Paid At: ${escapeHtml(formatDateTime(order.paidAt || order.createdAt))}</div>
        </div>
      </div>

      <h2 class="heading">Order Line Items</h2>
      <table>
        <thead>
          <tr>
            <th>Item</th>
            <th>SKU</th>
            <th>Qty</th>
            <th>Unit</th>
            <th>Subtotal</th>
          </tr>
        </thead>
        <tbody>
          ${rows || `<tr><td colspan="5">No line items</td></tr>`}
        </tbody>
      </table>

      <div class="totals">
        <div><span>Subtotal</span><span>${escapeHtml(formatMoney(order.subtotal, order.currency || "GBP"))}</span></div>
        <div><span>Delivery Fee</span><span>${escapeHtml(formatMoney(order.deliveryFee || 0, order.currency || "GBP"))}</span></div>
        <div><span>Discount</span><span>-${escapeHtml(formatMoney(order.discountAmount || 0, order.currency || "GBP"))}</span></div>
        <div class="final"><span>Total Paid (Inc. VAT)</span><span>${escapeHtml(formatMoney(order.total, order.currency || "GBP"))}</span></div>
      </div>

      ${
        refundRows
          ? `
        <h3 class="subheading">Refund History</h3>
        <table>
          <thead>
            <tr>
              <th>Date</th><th>Status</th><th>Amount</th><th>Reason</th>
            </tr>
          </thead>
          <tbody>${refundRows}</tbody>
        </table>
      `
          : ""
      }

      <div class="footer-note">
        For billing support contact ${escapeHtml(businessProfile.supportEmail || "support")} ${
          businessProfile.supportPhone
            ? `or ${escapeHtml(businessProfile.supportPhone)}`
            : ""
        }.
      </div>
    </div>
  </div>
  <script>
    const printBtn = document.getElementById("printBtn");
    if (printBtn) {
      printBtn.addEventListener("click", () => window.print());
    }
  </script>
</body>
</html>`;
}

const PlaceOrder = async (req, res) => {
  const result = await ordersService.PlaceOrder({
    customerId: req.customer._id,
    ...req.body,
  });
  if (!result.success)
    return sendErr(res, { statusCode: 400, message: result.message });
  return sendCreated(res, result.data, { message: result.message });
};

const ListOrders = async (req, res) => {
  const { page, pageSize, status, search } = req.query;
  const result = await ordersService.ListOrders({
    customerId: req.customer._id,
    page: Number(page) || 1,
    pageSize: Number(pageSize) || 20,
    status,
    search,
  });
  return sendOk(res, result.data);
};

const GetOrder = async (req, res) => {
  const result = await ordersService.GetOrder({
    customerId: req.customer._id,
    orderId: req.params.orderId,
  });
  if (!result.success)
    return sendErr(res, { statusCode: 404, message: result.message });
  return sendOk(res, result.data);
};

const UpdateOrderDelivery = async (req, res) => {
  const result = await ordersService.UpdateOrderDelivery({
    customerId: req.customer._id,
    orderId: req.params.orderId,
    ...req.body,
  });
  if (!result.success) {
    const statusCode = result.message === "Order not found" ? 404 : 400;
    return sendErr(res, { statusCode, message: result.message });
  }
  return sendOk(res, result.data, { message: result.message });
};

const DownloadReceipt = async (req, res) => {
  const result = await ordersService.GetOrderReceiptUrl({
    customerId: req.customer._id,
    orderId: req.params.orderId,
  });

  if (!result.success) {
    const statusCode = result.message === "Order not found" ? 404 : 400;
    return sendErr(res, { statusCode, message: result.message });
  }

  return res.redirect(result.data.receiptUrl);
};

const GetReceiptUrl = async (req, res) => {
  const result = await ordersService.GetOrderReceiptUrl({
    customerId: req.customer._id,
    orderId: req.params.orderId,
  });

  if (!result.success) {
    const statusCode = result.message === "Order not found" ? 404 : 400;
    return sendErr(res, { statusCode, message: result.message });
  }

  return sendOk(res, { receiptUrl: result.data.receiptUrl });
};

const RenderCustomReceipt = async (req, res) => {
  const result = await ordersService.GetOrderReceiptData({
    customerId: req.customer._id,
    orderId: req.params.orderId,
  });

  if (!result.success) {
    const statusCode = result.message === "Order not found" ? 404 : 400;
    return sendErr(res, { statusCode, message: result.message });
  }

  const businessProfile = await resolveBusinessProfile();
  const html = buildReceiptHtml(result.data.order, businessProfile);
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; style-src 'self' https: 'unsafe-inline'; script-src 'self' 'unsafe-inline'; img-src 'self' data: https://res.cloudinary.com https://*.basemaps.cartocdn.com; font-src 'self' https: data:;",
  );
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  return res.status(200).send(html);
};

const CancelOrder = async (req, res) => {
  const result = await ordersService.CancelOrder({
    customerId: req.customer._id,
    orderId: req.params.orderId,
    reason: req.body?.reason,
  });
  if (!result.success)
    return sendErr(res, { statusCode: 400, message: result.message });
  return sendOk(res, result.data, { message: result.message });
};

const Reorder = async (req, res) => {
  const result = await ordersService.Reorder({
    customerId: req.customer._id,
    orderId: req.params.orderId,
  });
  if (!result.success)
    return sendErr(res, { statusCode: 400, message: result.message });
  return sendCreated(res, result.data, { message: "Reorder placed" });
};

module.exports = {
  PlaceOrder,
  ListOrders,
  GetOrder,
  UpdateOrderDelivery,
  DownloadReceipt,
  GetReceiptUrl,
  RenderCustomReceipt,
  CancelOrder,
  Reorder,
};
