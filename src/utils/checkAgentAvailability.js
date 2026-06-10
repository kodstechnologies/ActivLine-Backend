import chatMessageModel from "../models/chat/chatMessage.model.js";
import Customer from "../models/Customer/customer.model.js";
import Franchise from "../models/Franchise/franchise.model.js";
import ApiResponse from "./ApiReponse.js";
import * as ChatMsgRepo from "../repositories/chat/chatMessage.repository.js";
import { getIO } from "../socket/index.js";

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

const sendSupportMessage = async (io, roomId, newMessage) => {
  setTimeout(async () => {
    const msg = await ChatMsgRepo.saveMessage({
      roomId: roomId,
      senderId: "000000000000000000000000", // Placeholder ID for SuperAdmin
      senderModel: "Admin",
      senderRole: "SUPER_ADMIN",
      message: newMessage,
      messageType: "TEXT",
      statusAtThatTime: "OPEN",
    });

    const populatedMsg = await chatMessageModel
      .findById(msg._id)
      .populate("senderId", "name fullName email mobile role");

    // The populated message is sent so client has all details,
    // which is consistent with HTTP responses.
    io.to(roomId).emit("new-message", populatedMsg);
  }, 5000);
};
// This function calculates the current time in Kolkata in minutes since midnight
const getKolkataMinutes = () => {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  });

  const parts = formatter.formatToParts(now);
  const hour = parseInt(parts.find((p) => p.type === "hour").value, 10);
  const minute = parseInt(parts.find((p) => p.type === "minute").value, 10);

  return hour * 60 + minute;
};
//
// This middleware checks if agents are available based on the current time and franchise settings.
export const checkAgentAvailability = async (req, res, next) => {
  try {
    const io = getIO();
    const { roomId } = req.body;
    const currentMinutes = getKolkataMinutes();
    // Default availability is 9:00 AM to 9:00 PM (540 to 1260 minutes)
    let startMinutes = 9 * 60; // Default 9:00 AM (540 minutes)
    let endMinutes = 21 * 60; // Default 9:00 PM (1260 minutes)
    let displayStart = "9AM";
    let displayEnd = "9PM";

    // Fetch franchise availability if customer has accountId
    if (req.user?.accountId) {
      const franchise = await Franchise.findOne({
        accountId: req.user.accountId,
      });
      if (franchise && franchise.franchise_availavility) {
        const parsedStart = parseTimeToMinutes(
          franchise.franchise_availavility.startTime,
        );
        const parsedEnd = parseTimeToMinutes(
          franchise.franchise_availavility.endTime,
        );
        if (parsedStart !== null && parsedEnd !== null) {
          startMinutes = parsedStart;
          endMinutes = parsedEnd;
          displayStart = franchise.franchise_availavility.startTime;
          displayEnd = franchise.franchise_availavility.endTime;
        }
      }
    }

    let isAvailable = false;
    if (startMinutes <= endMinutes) {
      isAvailable =
        currentMinutes >= startMinutes && currentMinutes <= endMinutes;
    } else {
      // Handles overnight/cross-midnight ranges
      isAvailable =
        currentMinutes >= startMinutes || currentMinutes <= endMinutes;
    }

    if (!isAvailable) {
      try {
        if (req.user?._id) {
          await Customer.findByIdAndUpdate(req.user._id, {
            pendingAgentNotification: true,
          });

          await sendSupportMessage(
            io,
            roomId,
            `Agent is available between ${displayStart} to ${displayEnd}. Your request has been noted, agents will contact you soon shortly.`,
          );
        }
      } catch (err) {}

      return res.json(
        ApiResponse.success(
          "",
          `Agent is available between ${displayStart} to ${displayEnd}`,
        ),
      );
    }

    // send message for waiting for agent response

    await sendSupportMessage(
      io,
      roomId,
      "Please wait, agents are connecting to you soon.",
    );

    next();
  } catch (error) {
    next();
  }
};
