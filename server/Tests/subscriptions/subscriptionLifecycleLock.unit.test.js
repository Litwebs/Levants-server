const Subscription = require('../../models/subscription.model');
const Mutation = require('../../models/subscriptionMutation.model');
beforeEach(() => jest.spyOn(Mutation, 'exists').mockResolvedValue(false));
const { withSubscriptionLifecycleLock: run } = require('../../services/subscriptions/subscriptionLifecycleLock.service');
afterEach(() => { jest.restoreAllMocks(); jest.useRealTimers(); });
it('rejects a held portal lock before reading or changing lifecycle state', async () => {
  jest.spyOn(Subscription, 'findOneAndUpdate').mockReturnValue({ select: async () => null });
  const execute = jest.fn();
  await expect(run('stripe', execute)).rejects.toMatchObject({ statusCode: 503, code: 'SUBSCRIPTION_LIFECYCLE_BUSY', message: expect.stringContaining('retry this webhook') });
  expect(execute).not.toHaveBeenCalled();
});
it('holds the shared lock until the handler finishes and releases only its own token', async () => {
  jest.spyOn(Subscription, 'findOneAndUpdate').mockReturnValue({ select: async () => ({ _id: 's' }) });
  const release = jest.spyOn(Subscription, 'updateOne').mockResolvedValue({ matchedCount: 1 });
  await run('stripe', async () => { expect(release).not.toHaveBeenCalled(); });
  const token = Subscription.findOneAndUpdate.mock.calls[0][1].$set.customerMutationLock.operationId;
  expect(release).toHaveBeenCalledWith({ _id: 's', 'customerMutationLock.operationId': token },
    { $unset: { customerMutationLock: 1 } }, { timestamps: false });
});
it('releases the lock after failure so provider retry can run', async () => {
  jest.spyOn(Subscription, 'findOneAndUpdate').mockReturnValue({ select: async () => ({ _id: 's' }) });
  jest.spyOn(Subscription, 'updateOne').mockResolvedValue({ matchedCount: 1 });
  await expect(run('stripe', async () => { throw new Error('provider failed'); })).rejects.toThrow('provider failed');
  expect(Subscription.updateOne).toHaveBeenCalledTimes(1);
});
it('renews a long-running handler lease', async () => {
  jest.useFakeTimers();
  jest.spyOn(Subscription, 'findOneAndUpdate').mockReturnValue({ select: async () => ({ _id: 's' }) });
  jest.spyOn(Subscription, 'updateOne').mockResolvedValue({ matchedCount: 1 });
  await run('stripe', async () => { await jest.advanceTimersByTimeAsync(21000); });
  expect(Subscription.updateOne.mock.calls[0][1].$set['customerMutationLock.lockedAt']).toBeInstanceOf(Date);
});
it('defers provider events while a paid add-on refund is unfinished', async () => {
  jest.spyOn(Subscription, 'findOneAndUpdate').mockReturnValue({ select: async () => ({ _id: 's' }) });
  jest.spyOn(Subscription, 'updateOne').mockResolvedValue({ matchedCount: 1 });
  Mutation.exists.mockResolvedValue(true);
  const execute = jest.fn();
  await expect(run('stripe', execute)).rejects.toMatchObject({ statusCode: 503, code: 'SUBSCRIPTION_LIFECYCLE_BUSY' });
  expect(execute).not.toHaveBeenCalled();
  expect(Subscription.updateOne).toHaveBeenCalledTimes(1);
});
