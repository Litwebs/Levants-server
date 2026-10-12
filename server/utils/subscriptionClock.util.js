"use strict";

// Keep the subscription business clock injectable without changing the clock
// used by MongoDB connection heartbeats, leases, or other infrastructure.
module.exports = { now: () => Date.now() };
