import cron from "node-cron";
import Customer from "../models/Customer/customer.model.js";
import Franchise from "../models/Franchise/franchise.model.js";
import ChatRoom from "../models/chat/chatRoom.model.js";
import { notifyCustomer } from "../services/Notification/customer.notification.service.js";
import { sendMessage } from "../utils/sendMessage.js";
import { SMS_TEMPLATE_ID } from "../constants/sms_template_id.js";

const parseTimeToMinutes = (timeStr) => {
  if (!timeStr) return null;
  const match = timeStr.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return null;
  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const ampm = match[3].toUpperCase();

  if (ampm === "PM" && hours !== 12) {
    hours += 12;
  } else if (ampm === "AM" && hours === 12) {
    hours = 0;
  }
  return hours * 60 + minutes;
};

export const startAgentAvailabilityCron = () => {
  // Run every 5 minutes to dynamically check pending notifications against franchise hours in IST
  cron.schedule("*/5 * * * *", async () => {
    try {
      const customers = await Customer.find({
        status: "ACTIVE",
        pendingAgentNotification: true,
      }).select("firstName userName phoneNumber accountId");

      if (!customers.length) {
        return;
      }

      console.log(`[CRON] Found ${customers.length} pending customer notifications to evaluate...`);

      // Get current local time in IST
      const now = new Date();
      // Adjust to IST timezone offset (+5:30)
      const utcTime = now.getTime() + now.getTimezoneOffset() * 60000;
      const istTime = new Date(utcTime + 3600000 * 5.5);
      const currentMinutes = istTime.getHours() * 60 + istTime.getMinutes();

      for (const customer of customers) {
        let startTime = "09:00 AM";
        let endTime = "09:00 PM";

        if (customer.accountId) {
          const franchise = await Franchise.findOne({ accountId: customer.accountId });
          if (franchise && franchise.franchise_availavility) {
            startTime = franchise.franchise_availavility.startTime || startTime;
            endTime = franchise.franchise_availavility.endTime || endTime;
          }
        }

        const startMinutes = parseTimeToMinutes(startTime) ?? (9 * 60);
        const endMinutes = parseTimeToMinutes(endTime) ?? (21 * 60);

        let isAvailable = false;
        if (startMinutes <= endMinutes) {
          isAvailable = currentMinutes >= startMinutes && currentMinutes <= endMinutes;
        } else {
          // Handles overnight/cross-midnight ranges
          isAvailable = currentMinutes >= startMinutes || currentMinutes <= endMinutes;
        }

        // If their franchise is open now, send the notification!
        if (isAvailable) {
          console.log(`[CRON] Franchise is available for customer ${customer._id}. Sending notification...`);
          
          const name = customer.firstName || customer.userName || "Customer";
          const templateObj = SMS_TEMPLATE_ID.AGENT_AVAILABLE 
            ? SMS_TEMPLATE_ID.AGENT_AVAILABLE(name, startTime, endTime) 
            : { ID: "", MESSAGE: `Hi ${name}, agent is available between ${startTime} to ${endTime} you can connect now.` };

          const smsMessage = templateObj.MESSAGE;
          const pushMessage = `Agent is available (from ${startTime} to ${endTime}), you can connect now.`;

          // 1️⃣ Send Push Notification
          try {
            await notifyCustomer({
              customerId: customer._id,
              title: "Agent Available",
              message: pushMessage,
              type: "SYSTEM",
            });
            console.log(`[CRON] Push notification sent to customer ${customer._id}`);
          } catch (pushErr) {
            console.error(`[CRON] Push notification failed for customer ${customer._id}:`, pushErr.message);
          }

          // 2️⃣ Send SMS with DLT Template ID
          if (customer.phoneNumber) {
            try {
              await sendMessage({
                mobile: customer.phoneNumber,
                message: smsMessage,
                template_id: templateObj.ID,
              });
              console.log(`[CRON] SMS sent successfully to ${customer.phoneNumber}`);
            } catch (smsErr) {
              console.error(`[CRON] SMS failed for ${customer.phoneNumber}:`, smsErr.message);
            }
          }

          // 3️⃣ Clear the flag so they are only notified once
          try {
            await Customer.findByIdAndUpdate(customer._id, {
              pendingAgentNotification: false,
            });
            console.log(`[CRON] Reset pendingAgentNotification flag for customer ${customer._id}`);
          } catch (dbErr) {
            console.error(`[CRON] Failed to reset flag for customer ${customer._id}:`, dbErr.message);
          }
        }
      }
    } catch (error) {
      console.error("[CRON] Error in Agent Availability Cron:", error);
    }
  }, {
    scheduled: true,
    timezone: "Asia/Kolkata"
  });

  // Run once every hour to check for overdue support tickets and send SLA SMS alerts
  cron.schedule("0 * * * *", async () => {
    try {
      const SEVEN_DAYS_AGO = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const ONE_MONTH_AGO = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      // Find tickets open for > 7 days, haven't been warned in 7 days, and are newer than 30 days
      const overdueTickets = await ChatRoom.find({
        status: { $in: ["OPEN", "ASSIGNED", "IN_PROGRESS"] },
        createdAt: { $gte: ONE_MONTH_AGO }, 
        $or: [
          { lastOverdueSmsSentAt: { $exists: false }, createdAt: { $lte: SEVEN_DAYS_AGO } },
          { lastOverdueSmsSentAt: null, createdAt: { $lte: SEVEN_DAYS_AGO } },
          { lastOverdueSmsSentAt: { $lte: SEVEN_DAYS_AGO } }
        ]
      }).populate("customer");

      console.log(`[CRON] Found ${overdueTickets.length} overdue support tickets to notify (7-day SLA loop).`);

      for (const ticket of overdueTickets) {
        if (ticket.customer?.phoneNumber) {
          try {
            const customerName = ticket.customer.firstName || ticket.customer.userName || "Customer";
            const { ID, MESSAGE } = SMS_TEMPLATE_ID.TICKET_OVERDUE_SUPPORT_TEAM(
              customerName,
              ticket._id
            );
            await sendMessage({
              mobile: ticket.customer.phoneNumber,
              message: MESSAGE,
              template_id: ID,
            });
            console.log(`[CRON] 7-Day SLA ticket SMS sent to ${ticket.customer.phoneNumber} for ticket ${ticket._id}`);

            // Reset the 7-day timer tracker after a successful SMS send
            await ChatRoom.findByIdAndUpdate(ticket._id, {
              lastOverdueSmsSentAt: new Date(),
            });
          } catch (smsErr) {
            console.error(`[CRON] Failed to send 7-Day SLA ticket SMS for ${ticket._id}:`, smsErr.message);
          }
        }
      }
    } catch (err) {
      console.error("[CRON] Error in Ticket Overdue warning job:", err.message);
    }
  }, {
    scheduled: true,
    timezone: "Asia/Kolkata"
  });
};
