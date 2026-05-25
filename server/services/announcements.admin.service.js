const Announcement = require("../models/announcement.model");

async function ListAnnouncements({ page = 1, pageSize = 20 }) {
  const skip = (page - 1) * pageSize;

  const [announcements, total] = await Promise.all([
    Announcement.find()
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(pageSize)
      .lean(),
    Announcement.countDocuments(),
  ]);

  const totalPages = Math.ceil(total / pageSize) || 1;

  return {
    success: true,
    data: { announcements },
    meta: { total, page, pageSize, totalPages },
  };
}

async function CreateAnnouncement({ body, userId }) {
  const announcement = await Announcement.create({
    title: body.title,
    description: body.description || "",
    expiresAt: body.expiresAt || undefined,
    isActive: false,
    createdBy: userId,
  });

  return { success: true, data: { announcement } };
}

async function UpdateAnnouncement({ announcementId, body }) {
  const existing = await Announcement.findById(announcementId);
  if (!existing) {
    return {
      success: false,
      statusCode: 404,
      message: "Announcement not found",
    };
  }

  // Enforce single-active rule: if activating this one, deactivate all others first
  if (body.isActive === true) {
    await Announcement.updateMany(
      { _id: { $ne: announcementId } },
      { $set: { isActive: false } },
    );
  }

  const updates = {};
  if (body.title !== undefined) updates.title = body.title;
  if (body.description !== undefined) updates.description = body.description;
  if ("expiresAt" in body) updates.expiresAt = body.expiresAt ?? undefined;
  if (body.isActive !== undefined) updates.isActive = body.isActive;

  const updated = await Announcement.findByIdAndUpdate(
    announcementId,
    { $set: updates },
    { new: true },
  ).lean();

  return { success: true, data: { announcement: updated } };
}

async function DeleteAnnouncement({ announcementId }) {
  const deleted = await Announcement.findByIdAndDelete(announcementId);
  if (!deleted) {
    return {
      success: false,
      statusCode: 404,
      message: "Announcement not found",
    };
  }
  return { success: true, data: { announcement: deleted } };
}

async function GetActiveAnnouncement() {
  const now = new Date();

  const announcement = await Announcement.findOne({
    isActive: true,
    $or: [
      { expiresAt: { $exists: false } },
      { expiresAt: null },
      { expiresAt: { $gt: now } },
    ],
  })
    .select("title description expiresAt")
    .lean();

  return { success: true, data: { announcement: announcement || null } };
}

module.exports = {
  ListAnnouncements,
  CreateAnnouncement,
  UpdateAnnouncement,
  DeleteAnnouncement,
  GetActiveAnnouncement,
};
