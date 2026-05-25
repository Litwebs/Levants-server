const service = require("../services/announcements.admin.service");
const { sendOk, sendErr } = require("../utils/response.util");

const ListAnnouncements = async (req, res) => {
  const page = Number(req.query.page || 1);
  const pageSize = Number(req.query.pageSize || 20);

  const result = await service.ListAnnouncements({ page, pageSize });
  return sendOk(res, result.data, { meta: result.meta });
};

const CreateAnnouncement = async (req, res) => {
  const result = await service.CreateAnnouncement({
    body: req.body,
    userId: req.user?._id,
  });

  if (!result.success) {
    return sendErr(res, {
      statusCode: result.statusCode || 400,
      message: result.message || "Failed to create announcement",
    });
  }

  return sendOk(res, result.data);
};

const UpdateAnnouncement = async (req, res) => {
  const result = await service.UpdateAnnouncement({
    announcementId: req.params.announcementId,
    body: req.body,
  });

  if (!result.success) {
    return sendErr(res, {
      statusCode: result.statusCode || 400,
      message: result.message || "Failed to update announcement",
    });
  }

  return sendOk(res, result.data);
};

const DeleteAnnouncement = async (req, res) => {
  const result = await service.DeleteAnnouncement({
    announcementId: req.params.announcementId,
  });

  if (!result.success) {
    return sendErr(res, {
      statusCode: result.statusCode || 400,
      message: result.message || "Failed to delete announcement",
    });
  }

  return sendOk(res, result.data);
};

const GetActiveAnnouncement = async (req, res) => {
  const result = await service.GetActiveAnnouncement();
  return sendOk(res, result.data);
};

module.exports = {
  ListAnnouncements,
  CreateAnnouncement,
  UpdateAnnouncement,
  DeleteAnnouncement,
  GetActiveAnnouncement,
};
