const Broadcast = require("../models/broadcast.model");
const sendEmail = require("../Integration/Email.service");
const {
  normalizeAudience,
  resolveAudience,
} = require("./broadcastAudience.service");

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
  if (!body.title?.trim() || !body.description?.trim()) {
    return {
      success: false,
      statusCode: 400,
      message: "Add both a title and message before creating the broadcast.",
    };
  }
  const messageType = body.messageType === "marketing" ? "marketing" : "operational";
  const preview = await resolveAudience({
    audience: body.audience,
    messageType,
  });
  const broadcast = await Broadcast.create({
    title: body.title.trim(),
    description: body.description.trim(),
    messageType,
    audience: preview.filters,
    audienceSummary: {
      estimatedRecipients: preview.totalRecipients,
      ...preview.breakdown,
      calculatedAt: new Date(),
    },
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

  const contentChanged = [
    "title",
    "description",
    "messageType",
    "audience",
  ].some((field) => Object.prototype.hasOwnProperty.call(body, field));
  if (contentChanged && existing.emailStatus === "sending") {
    return {
      success: false,
      statusCode: 409,
      message: "Wait for the current send to finish before editing this broadcast.",
    };
  }

  const updates = {};
  if (body.title !== undefined && !body.title?.trim()) {
    return { success: false, statusCode: 400, message: "Title cannot be empty." };
  }
  if (body.description !== undefined && !body.description?.trim()) {
    return { success: false, statusCode: 400, message: "Message cannot be empty." };
  }
  if (body.title !== undefined) updates.title = body.title.trim();
  if (body.description !== undefined) updates.description = body.description.trim();
  if (body.messageType !== undefined) {
    updates.messageType = body.messageType === "marketing" ? "marketing" : "operational";
  }
  if (body.audience !== undefined || body.messageType !== undefined) {
    const messageType = updates.messageType || existing.messageType || "operational";
    const preview = await resolveAudience({
      audience: body.audience === undefined ? existing.audience : body.audience,
      messageType,
    });
    updates.audience = preview.filters;
    updates.audienceSummary = {
      estimatedRecipients: preview.totalRecipients,
      ...preview.breakdown,
      calculatedAt: new Date(),
    };
  }
  if ("expiresAt" in body) updates.expiresAt = body.expiresAt || undefined;
  if (body.isActive !== undefined) updates.isActive = body.isActive;
  if (contentChanged) updates.emailStatus = "not_sent";

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

  if (broadcast.emailStatus === "sending") {
    return {
      success: false,
      statusCode: 409,
      message: "This broadcast is already being sent.",
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

  const preview = await resolveAudience({
    audience: broadcast.audience,
    messageType: broadcast.messageType,
    sampleSize: 0,
  });
  const recipients = preview.recipients;

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
            lastError: "No customers currently match this audience.",
          },
        },
      },
      { new: true },
    ).lean();

    return {
      success: false,
      statusCode: 400,
      message: "No customers currently match this audience.",
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
        audienceSummary: {
          estimatedRecipients: recipients.length,
          ...preview.breakdown,
          calculatedAt: new Date(),
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
