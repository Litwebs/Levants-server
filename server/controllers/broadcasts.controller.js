const service = require("../services/broadcast.admin.service");
const { sendOk, sendErr } = require("../utils/response.util");

const ListBroadcasts = async (req, res) => {
  const page = Number(req.query.page || 1);
  const pageSize = Number(req.query.pageSize || 20);

  const result = await service.ListBroadcasts({ page, pageSize });
  return sendOk(res, result.data, { meta: result.meta });
};

const CreateBroadcast = async (req, res) => {
  const result = await service.CreateBroadcast({
    body: req.body,
    userId: req.user?._id,
  });

  if (!result.success) {
    return sendErr(res, {
      statusCode: result.statusCode || 400,
      message: result.message || "Failed to create broadcast",
    });
  }

  return sendOk(res, result.data);
};

const UpdateBroadcast = async (req, res) => {
  const result = await service.UpdateBroadcast({
    broadcastId: req.params.broadcastId,
    body: req.body,
  });

  if (!result.success) {
    return sendErr(res, {
      statusCode: result.statusCode || 400,
      message: result.message || "Failed to update broadcast",
    });
  }

  return sendOk(res, result.data);
};

const DeleteBroadcast = async (req, res) => {
  const result = await service.DeleteBroadcast({
    broadcastId: req.params.broadcastId,
  });

  if (!result.success) {
    return sendErr(res, {
      statusCode: result.statusCode || 400,
      message: result.message || "Failed to delete broadcast",
    });
  }

  return sendOk(res, result.data);
};

const SendBroadcastEmail = async (req, res) => {
  const result = await service.SendBroadcastEmail({
    broadcastId: req.params.broadcastId,
    userId: req.user?._id,
  });

  if (!result.success) {
    return sendErr(res, {
      statusCode: result.statusCode || 400,
      message: result.message || "Failed to send broadcast email",
    });
  }

  return sendOk(res, result.data);
};

const GetActiveBroadcast = async (req, res) => {
  const result = await service.GetActiveBroadcast();
  return sendOk(res, result.data);
};

module.exports = {
  ListBroadcasts,
  CreateBroadcast,
  UpdateBroadcast,
  DeleteBroadcast,
  SendBroadcastEmail,
  GetActiveBroadcast,
};
