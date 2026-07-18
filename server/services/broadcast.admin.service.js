const Broadcast = require("../models/broadcast.model");
const Customer = require("../models/customer.model");
const sendEmail = require("../Integration/Email.service");

function normalizeEmail(email = "") {
  return String(email).trim().toLowerCase();
}

function buildRecipientList(customers = []) {
  const byEmail = new Map();

  for (const customer of customers) {
    const email = normalizeEmail(customer.email);
    if (!email || byEmail.has(email)) continue;

    byEmail.set(email, {
      email,
      firstName: customer.firstName || "",
      lastName: customer.lastName || "",
      customerId: customer._id,
    });
  }

  return Array.from(byEmail.values());
}

async function ListBroadcasts({ page = 1, pageSize = 20 }) {
  const safePage = Math.max(Number(page) || 1, 1);
  const safePageSize = Math.min(Math.max(Number(pageSize) || 20, 1), 100);
  const skip = (safePage - 1) * safePageSize;

  const [broadcasts, total] = await Promise.all([
    Broadcast.find()
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(safePageSize)
      .lean(),
    Broadcast.countDocuments(),
  ]);

  return {
    success: true,
    data: { broadcasts },
    meta: {
      total,
      page: safePage,
      pageSize: safePageSize,
      totalPages: Math.ceil(total / safePageSize) || 1,
    },
  };
}

async function CreateBroadcast({ body, userId }) {
  const broadcast = await Broadcast.create({
    title: body.title,
    description: body.description || "",
    expiresAt: body.expiresAt || undefined,
    isActive: false,
    createdBy: userId,
  });

  return { success: true, data: { broadcast } };
}

async function UpdateBroadcast({ broadcastId, body }) {
  const existing = await Broadcast.findById(broadcastId).lean();

  if (!existing) {
    return {
      success: false,
      statusCode: 404,
      message: "Broadcast not found",
    };
  }

  const updates = {};
  if (body.title !== undefined) updates.title = body.title;
  if (body.description !== undefined) updates.description = body.description;
  if ("expiresAt" in body) updates.expiresAt = body.expiresAt || undefined;
  if (body.isActive !== undefined) updates.isActive = body.isActive;

  const broadcast = await Broadcast.findByIdAndUpdate(
    broadcastId,
    { $set: updates },
    { new: true },
  ).lean();

  return { success: true, data: { broadcast } };
}

async function DeleteBroadcast({ broadcastId }) {
  const broadcast = await Broadcast.findByIdAndDelete(broadcastId).lean();

  if (!broadcast) {
    return {
      success: false,
      statusCode: 404,
      message: "Broadcast not found",
    };
  }

  return { success: true, data: { broadcast } };
}

async function SendBroadcastEmail({ broadcastId, userId }) {
  const broadcast = await Broadcast.findById(broadcastId).lean();

  if (!broadcast) {
    return {
      success: false,
      statusCode: 404,
      message: "Broadcast not found",
    };
  }

  if (!broadcast.description || !broadcast.description.trim()) {
    return {
      success: false,
      statusCode: 400,
      message: "Add a message before sending this broadcast.",
    };
  }

  await Broadcast.findByIdAndUpdate(broadcastId, {
    $set: {
      emailStatus: "sending",
      emailedBy: userId || null,
      "emailStats.lastError": null,
    },
  });

  const customers = await Customer.find({
    email: { $exists: true, $nin: [null, ""] },
    status: "active",
  })
    .select("_id email firstName lastName notificationPreferences")
    .lean();

  const recipients = buildRecipientList(customers);

  if (recipients.length === 0) {
    const updated = await Broadcast.findByIdAndUpdate(
      broadcastId,
      {
        $set: {
          emailStatus: "failed",
          emailedBy: userId || null,
          emailedAt: new Date(),
          emailStats: {
            totalRecipients: 0,
            sent: 0,
            failed: 0,
            lastError: "No active customer email addresses were found.",
          },
        },
      },
      { new: true },
    ).lean();

    return {
      success: false,
      statusCode: 400,
      message: "No active customer email addresses were found.",
      data: { broadcast: updated },
    };
  }

  const results = [];

  for (const recipient of recipients) {
    const result = await sendEmail(
      recipient.email,
      broadcast.emailSubject || broadcast.title,
      "serviceAnnouncement",
      {
        customerName: recipient.firstName || "there",
        title: broadcast.title,
        description: broadcast.description,
      },
    );

    results.push({
      to: recipient.email,
      success: !!result.success,
      response: result.response,
      error: result.error,
    });
  }

  const sent = results.filter((result) => result.success).length;
  const failed = results.filter((result) => !result.success).length;
  const firstError =
    results.find((result) => !result.success)?.error?.message || null;

  let emailStatus = "sent";
  if (sent === 0 && failed > 0) emailStatus = "failed";
  if (sent > 0 && failed > 0) emailStatus = "partial";

  const updated = await Broadcast.findByIdAndUpdate(
    broadcastId,
    {
      $set: {
        emailStatus,
        emailedAt: new Date(),
        emailedBy: userId || null,
        emailStats: {
          totalRecipients: recipients.length,
          sent,
          failed,
          lastError: firstError,
        },
      },
    },
    { new: true },
  ).lean();

  return {
    success: true,
    data: {
      broadcast: updated,
      email: {
        totalRecipients: recipients.length,
        sent,
        failed,
        lastError: firstError,
      },
    },
  };
}

async function GetActiveBroadcast() {
  const now = new Date();

  const broadcast = await Broadcast.findOne({
    isActive: true,
    $or: [
      { expiresAt: { $exists: false } },
      { expiresAt: null },
      { expiresAt: { $gt: now } },
    ],
  })
    .select("title description expiresAt")
    .lean();

  return { success: true, data: { broadcast: broadcast || null } };
}

module.exports = {
  ListBroadcasts,
  CreateBroadcast,
  UpdateBroadcast,
  DeleteBroadcast,
  SendBroadcastEmail,
  GetActiveBroadcast,
};
