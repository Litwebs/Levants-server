"use strict";
jest.mock('../../utils/stripe.util', () => ({}));
jest.mock('../../services/customerPortal/subscriptionEmailNotifications.service', () => ({}));
jest.mock('../../services/customerPortal/subscriptionDeliveryAddress.service', () => ({ locateDeliveryAddress: jest.fn() }));
jest.mock('../../services/customerPortal/subscriptionRefundSettlement.service', () => ({
  hasUnfinishedCardRefund: jest.fn(), refundAcrossSubscriptionPayments: jest.fn(),
  refundFailure: jest.fn(() => ({ success: false, message: 'retry reached saved refund' })),
}));
const Subscription = require('../../models/subscription.model');
const Customer = require('../../models/customer.model');
const Order = require('../../models/order.model');
const settings = require('../../services/subscriptionSettings.service');
const clock = require('../../utils/subscriptionClock.util');
const settlement = require('../../services/customerPortal/subscriptionRefundSettlement.service');
const { locateDeliveryAddress } = require('../../services/customerPortal/subscriptionDeliveryAddress.service');
const { UpdateSubscription: update } = require('../../services/customerPortal/customerSubscriptions.service');
let subscription, payload, address;
beforeEach(() => {
  jest.clearAllMocks();
  address = { line1: '1 Test Street', city: 'London', postcode: 'SW1A 1AA', country: 'United Kingdom' };
  const items = [{ variant: 'v', quantity: 1, unitPrice: 2.5 }];
  subscription = { _id: 's', status: 'active', frequency: 'weekly', notes: null,
    preferredDeliveryDay: 0, preferredDeliveryDays: [0, 3], nextDeliveryDate: new Date('2030-01-06T12:00:00Z'),
    items: [{ ...items[0], quantity: 2 }], deliveryAddress: { ...address },
    deliveryDayPlans: [0, 3].map(day => ({ day, items })),
  };
  payload = { customerId: 'c', subscriptionId: 's', preferredDeliveryDay: 3, preferredDeliveryDays: [3],
    deliveryAddressId: 'address', refundMethod: 'refund',
    deliveryDayPlans: [{ day: 3, items: [{ variantId: 'v', quantity: 1 }] }],
  };
  jest.spyOn(Subscription, 'findOne').mockResolvedValue(subscription);
  jest.spyOn(Customer, 'findById').mockResolvedValue({ addresses: { id: () => address } });
  jest.spyOn(settings, 'getOrCreateSettings').mockResolvedValue({ deliveryDays: [0, 3], cutoffDaysBefore: 1, cutoffTime: '10:00' });
  jest.spyOn(clock, 'now').mockReturnValue(Date.parse('2030-01-01T08:00:00Z'));
  jest.spyOn(Order, 'find').mockReturnValue({ sort: () => ({ exec: async () => [{
    _id: 'order', deliveryDate: subscription.nextDeliveryDate, amountPaid: 3, total: 8, stripePaymentIntentId: 'pi_original',
  }] }) });
  settlement.hasUnfinishedCardRefund.mockResolvedValueOnce(true).mockResolvedValue(false);
  settlement.refundAcrossSubscriptionPayments.mockRejectedValue(new Error('simulated retry outcome'));
});
afterEach(() => jest.restoreAllMocks());
it('allows unchanged portal fields to resume the saved refund without repricing or geocoding', async () => {
  expect((await update(payload)).message).toBe('retry reached saved refund');
  expect(settlement.refundAcrossSubscriptionPayments).toHaveBeenCalledWith(subscription, expect.anything(),
    'pi_original', 300, 'subscription_schedule_change_refund', expect.stringContaining('remove-day'), 'order');
  expect(locateDeliveryAddress).not.toHaveBeenCalled();
});
it('accepts unchanged cadence and notes if a client includes them', async () => {
  expect((await update({ ...payload, frequency: 'weekly', notes: '' })).message).toBe('retry reached saved refund');
});
it.each([
  ['credit', p => ({ ...p, refundMethod: 'credit' })],
  ['cadence', p => ({ ...p, frequency: 'monthly' })],
  ['notes', p => ({ ...p, notes: 'new' })],
  ['products', p => ({ ...p, deliveryDayPlans: [{ day: 3, items: [{ variantId: 'v', quantity: 2 }] }] })],
  ['non-removal', p => ({ ...p, preferredDeliveryDays: [0, 3] })],
])('blocks a new %s change while the card refund is incomplete', async (_, change) => {
  expect((await update(change(payload))).success).toBe(false);
  expect(settlement.refundAcrossSubscriptionPayments).not.toHaveBeenCalled();
});
it('rejects a changed address before geocoding or moving money', async () => {
  address.line1 = '2 Changed Street';
  expect((await update(payload)).message).toMatch(/before changing the delivery address/);
  expect(locateDeliveryAddress).not.toHaveBeenCalled();
  expect(settlement.refundAcrossSubscriptionPayments).not.toHaveBeenCalled();
});
it('does not silently discard a staged address during refund recovery', async () => {
  subscription.pendingChanges = { deliveryAddress: { ...address, line1: 'Pending address' } };
  expect((await update(payload)).success).toBe(false);
  expect(locateDeliveryAddress).not.toHaveBeenCalled();
  expect(settlement.refundAcrossSubscriptionPayments).not.toHaveBeenCalled();
});
