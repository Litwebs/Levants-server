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

const { autoResume } = require('../../e2e/support/e2e-client');
const controlResponse = data => ({ ok: () => true, status: () => 200, json: async () => ({ data }) });
it('retries the actual auto-resume control request only for a reported lifecycle lock', async () => {
  jest.useFakeTimers();
  try {
    const post = jest.fn().mockResolvedValueOnce(controlResponse({ resumed: 0, subscriptionBusy: true }))
      .mockResolvedValueOnce(controlResponse({ resumed: 1, subscriptionBusy: false }));
    const pending = autoResume({ post }, 'same-subscription');
    await jest.advanceTimersByTimeAsync(250);
    expect((await pending).resumed).toBe(1);
    expect(post).toHaveBeenCalledTimes(2);
    expect(post.mock.calls[0]).toEqual(post.mock.calls[1]);
  } finally { jest.useRealTimers(); }
});
it('does not retry an auto-resume payment failure or an ineligible pause', async () => {
  const post = jest.fn().mockResolvedValue(controlResponse({ resumed: 0, subscriptionBusy: false }));
  expect((await autoResume({ post }, 'same-subscription')).resumed).toBe(0);
  expect(post).toHaveBeenCalledTimes(1);
});
