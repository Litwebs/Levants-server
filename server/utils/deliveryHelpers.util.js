"use strict";

const isDriverUser = (user) => String(user?.role?.name || "") === "driver";

const getUserId = (user) => {
  const id = user?._id || user?.id;
  return id ? String(id) : null;
};

function normalizeDateRange({ fromDate, toDate } = {}) {
  const filter = {};
  if (fromDate) {
    const d = new Date(fromDate);
    if (!Number.isNaN(d.getTime())) {
      filter.$gte = new Date(
        Date.UTC(
          d.getUTCFullYear(),
          d.getUTCMonth(),
          d.getUTCDate(),
          0,
          0,
          0,
          0,
        ),
      );
    }
  }
  if (toDate) {
    const d = new Date(toDate);
    if (!Number.isNaN(d.getTime())) {
      filter.$lte = new Date(
        Date.UTC(
          d.getUTCFullYear(),
          d.getUTCMonth(),
          d.getUTCDate(),
          23,
          59,
          59,
          999,
        ),
      );
    }
  }
  return Object.keys(filter).length ? filter : null;
}

module.exports = { isDriverUser, getUserId, normalizeDateRange };
