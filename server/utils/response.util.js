function base(success, payload = {}) {
  return {
    success,
    ...payload,
  };
}

const sendOk = (res, data = null, opts = {}) => {
  const { message, meta } = opts;

  return res.status(200).json({
    success: true,
    ...(message ? { message } : {}),
    ...(data !== null ? { data } : {}),
    ...(meta ? { meta } : {}),
  });
};

const Response = (
  success = false,
  message,
  data = null,
  meta = null,
  error = null
) => {
  return {
    success,
    ...(message ? { message } : {}),
    ...(data !== null ? { data } : {}),
    ...(meta ? { meta } : {}),
    ...(error ? { error } : {}),
  };
};

function sendCreated(res, data = null, opts = {}) {
  const { message, meta } = opts;

  return res.status(201).json(
    base(true, {
      message: message || "Created successfully",
      ...(data !== null ? { data } : {}),
      ...(meta ? { meta } : {}),
    })
  );
}

function sendNoContent(res) {
  return res?.status(204).send();
}

function sendPaginated(res, result, opts = {}) {
  const { message } = opts;

  const {
    items = [],
    total = 0,
    page = 1,
    pageSize = items.length,
    ...restMeta
  } = result || {};

  return res.status(200).json(
    base(true, {
      ...(message ? { message } : {}),
      data: items,
      meta: {
        page,
        pageSize,
        total,
        ...restMeta,
      },
    })
  );
}

function sendError(res, err) {
  const status = err.statusCode || err.status || 500;

  const payload = base(false, {
    error: {
      code: err.code || "INTERNAL_ERROR",
      message:
        status >= 500
          ? "Something went wrong, please try again later."
          : err.message || "Request failed",
      ...(err.details ? { details: err.details } : {}),
      data: null,
    },
  });

  return res.status(status).json(payload);
}

const sendErr = (res, err) => {
  const status = Number(err?.statusCode) || Number(err?.status) || 500;
  return res.status(status).json({
    success: false,
    message: err?.message || "An error occurred",
    data: null,
  });
};

module.exports = {
  sendOk,
  sendCreated,
  sendNoContent,
  sendPaginated,
  sendError,
  sendErr,
  Response,
};
