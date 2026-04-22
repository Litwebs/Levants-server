const DRIVER_NOTIFICATION_DEFAULTS = Object.freeze({
  newOrders: false,
  orderUpdates: false,
  lowStockAlerts: false,
  outOfStock: false,
  deliveryUpdates: false,
  customerMessages: false,
  paymentReceived: false,
});

module.exports = {
  DRIVER_NOTIFICATION_DEFAULTS,
};
