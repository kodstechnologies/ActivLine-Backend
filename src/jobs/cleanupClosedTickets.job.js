// src/jobs/cleanupClosedTickets.job.js
//
// Runs daily via node-cron.
// Finds CLOSED chat rooms whose closedAt timestamp is older than 90 days
// and permanently deletes them along with their messages and notifications.
//
// Schedule: every day at 02:00 AM server time.

import cron from "node-cron";
import ChatRoom from "../models/chat/chatRoom.model.js";
import ChatMessage from "../models/chat/chatMessage.model.js";
import CustomerNotification from "../models/Notification/customernotification.model.js";
import Notification from "../models/Notification/notification.model.js";

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

/**
 * Core cleanup logic — intentionally separated from the cron schedule
 * so it can be unit-tested or triggered manually via a CLI script.
 */
export const runClosedTicketCleanup = async () => {
  try {
    const cutoff = new Date(Date.now() - NINETY_DAYS_MS);

    // Lean projection — only _id needed; no population overhead.
    const expiredRooms = await ChatRoom.find(
      { status: "CLOSED", closedAt: { $lte: cutoff } },
      { _id: 1 }
    ).lean();

    if (expiredRooms.length === 0) {
      console.log("⏰ Cleanup: No expired closed tickets found.");
      return;
    }

    const roomIds = expiredRooms.map((r) => r._id);

    // Batch delete in parallel — all four collections hit simultaneously.
    await Promise.all([
      ChatMessage.deleteMany({ roomId: { $in: roomIds } }),
      ChatRoom.deleteMany({ _id: { $in: roomIds } }),
      CustomerNotification.deleteMany({ "data.roomId": { $in: roomIds } }),
      Notification.deleteMany({ "data.roomId": { $in: roomIds } }),
    ]);

    console.log(
      `🗑️  Cleanup [${new Date().toISOString()}]: Permanently deleted ${roomIds.length} expired closed ticket(s).`
    );
  } catch (err) {
    console.error("❌ Closed ticket cleanup job failed:", err.message);
  }
};

/**
 * Registers the daily cron schedule.
 * Must be called AFTER the database connection is established.
 *
 * Cron expression: "0 2 * * *"
 *   ┌─── minute  (0)
 *   │  ┌── hour   (2 = 02:00 AM)
 *   │  │  ┌─ day of month (*)
 *   │  │  │  ┌ month (*)
 *   │  │  │  │  ┌ day of week (*)
 *   0  2  *  *  *
 */
export const startCleanupJob = () => {
  cron.schedule("0 2 * * *", runClosedTicketCleanup, {
    scheduled: true,
    timezone: "Asia/Kolkata",   // IST — change to UTC if your server runs UTC
  });

  console.log("⏰ Closed ticket cleanup job scheduled — runs daily at 02:00 AM IST.");
};
