const cron = require("node-cron");
const User = require("../models/user.model");
const Session = require("../models/session.model");

async function cleanupExpiredInvitations() {
  const now = new Date();

  // Only users that are still pending an invitation acceptance.
  const expiredUsers = await User.find({
    status: "disabled",
    inviteTokenExpiresAt: { $lte: now },
    inviteTokenHash: { $exists: true, $ne: null },
  }).select("_id email");

  if (expiredUsers.length === 0) {
    return { removed: 0 };
  }

  const userIds = expiredUsers.map((u) => u._id);

  // Best-effort cleanup of sessions (should usually be none).
  await Session.deleteMany({ user: { $in: userIds } });

  const del = await User.deleteMany({ _id: { $in: userIds } });

  return { removed: del.deletedCount || 0 };
}

function startInvitationCleanupCron() {
  // Run every minute to enforce the 1-hour window promptly.
  cron.schedule("* * * * *", async () => {
    try {
      await cleanupExpiredInvitations();
    } catch (err) {
      console.error("Invitation cleanup cron error:", err);
    }
  });

  console.log("Invitation cleanup cron started");
}

module.exports = {
  cleanupExpiredInvitations,
  startInvitationCleanupCron,
};
