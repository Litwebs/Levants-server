const { retryTransientResponse: retry } = require('../../e2e/support/retry-transient-response');
it('redelivers the same operation until a transient response clears', async () => {
  const payload = { operationId: 'fixed', quantity: 2 };
  const send = jest.fn().mockResolvedValueOnce({ status: 503 }).mockResolvedValueOnce({ status: 503 }).mockResolvedValue({ status: 200 });
  const delay = jest.fn();
  const response = await retry(() => send(payload), r => r.status === 503, { delay });
  expect(response.status).toBe(200);
  expect(send.mock.calls).toEqual([[payload], [payload], [payload]]);
  expect(delay.mock.calls).toEqual([[250], [500]]);
});
it('returns business failures immediately without retrying or changing them', async () => {
  const send = jest.fn(async () => ({ status: 400, message: 'paused' }));
  expect(await retry(send, r => r.status === 503)).toEqual({ status: 400, message: 'paused' });
  expect(send).toHaveBeenCalledTimes(1);
});
it('bounds retries and returns the final busy response instead of hiding failure', async () => {
  const send = jest.fn(async () => ({ status: 503 }));
  expect((await retry(send, r => r.status === 503, { attempts: 3, delay: async () => {} })).status).toBe(503);
  expect(send).toHaveBeenCalledTimes(3);
});
