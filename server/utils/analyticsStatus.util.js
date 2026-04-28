const createAnalyticsCounts = () => ({
  pending: 0,
  unpaid: 0,
  paid: 0,
  failed: 0,
  cancelled: 0,
  refund_pending: 0,
  partially_refunded: 0,
  refunded: 0,
  refund_failed: 0,
});

const buildAnalyticsCounts = (statusCounts = []) => {
  const counts = createAnalyticsCounts();

  for (const row of statusCounts) {
    if (Object.prototype.hasOwnProperty.call(counts, row._id)) {
      counts[row._id] = row.count;
    }
  }

  return counts;
};

const summarizeAnalyticsCounts = (counts) => {
  const pending = (counts.pending || 0) + (counts.unpaid || 0);
  const refunded = (counts.partially_refunded || 0) + (counts.refunded || 0);
  const totalRefunds = (counts.refund_pending || 0) + refunded;

  return {
    pending,
    refunded,
    totalRefunds,
  };
};

const normalizeDeliveryStatus = (value) => {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
};

module.exports = {
  createAnalyticsCounts,
  buildAnalyticsCounts,
  summarizeAnalyticsCounts,
  normalizeDeliveryStatus,
};
