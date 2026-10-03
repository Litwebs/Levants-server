"use strict";
function selectInvoicesForRecovery(invoices, linkedIds, cutoffSeconds) {
  const paid = invoices.filter(invoice => invoice.paid || invoice.status === "paid");
  return {
    recent: paid.filter(invoice => Number(invoice.created) >= cutoffSeconds)
      .sort((a, b) => Number(a.created) - Number(b.created)),
    historical: paid.filter(invoice => Number(invoice.created) < cutoffSeconds && !linkedIds.has(invoice.id)),
  };
}
module.exports = { selectInvoicesForRecovery };
