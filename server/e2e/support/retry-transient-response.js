"use strict";
// Model provider/request redelivery without changing event or operation identity.
async function retryTransientResponse(execute, isTransient, { attempts = 6, delay = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
  for (let attempt = 0; ; attempt++) {
    const response = await execute();
    if (attempt + 1 >= attempts || !await isTransient(response)) return response;
    await delay(Math.min(250 * 2 ** attempt, 2000));
  }
}
module.exports = { retryTransientResponse };
