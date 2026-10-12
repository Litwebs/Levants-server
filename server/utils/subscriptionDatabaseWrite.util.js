"use strict";
const mongoose = require("mongoose");

// Only database work belongs in this callback. The driver retries aborted
// transient transactions and uncertain commits, without replaying provider
// commands. Explicit sessions let lease fences share the same transaction.
function subscriptionDatabaseWrite(execute) {
  return mongoose.connection.transaction(execute, { timeoutMS: 10000 });
}
module.exports = { subscriptionDatabaseWrite };
