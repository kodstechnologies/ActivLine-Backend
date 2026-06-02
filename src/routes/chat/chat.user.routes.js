import { Router } from "express";
import {
  openChat,
  getMyMessages,
  getMyChatRooms,
  connectToAgent,
  resolveTicket,
} from "../../controllers/chat/chat.user.controller.js";
import { verifyJWT } from "../../middlewares/auth.middleware.js";
import ApiResponse from "../../utils/ApiReponse.js";
import Customer from "../../models/Customer/customer.model.js";
import { checkAgentAvailability } from "../../utils/checkAgentAvailability.js";

const router = Router();

// const checkAgentAvailability = async (req, res, next) => {
//   const now = new Date();
//   const hour = now.getHours();
//   const minute = now.getMinutes();

//   let isAvailable = false;
//   if (hour >= 9 && hour < 21) {
//     isAvailable = true;
//   } else if (hour === 21 && minute === 0) {
//     isAvailable = true;
//   }

//   if (!isAvailable) {
//     try {
//       if (req.user?._id) {
//         await Customer.findByIdAndUpdate(req.user._id, {
//           pendingAgentNotification: true,
//         });
//       }
//     } catch (err) {
//       console.error(
//         "Failed to flag customer for agent availability notification:",
//         err.message,
//       );
//     }

//     return res.status(400).json(
//       ApiResponse.error("Agent is available between 9AM to 9PM")
//     );
//   }

//   next();
// };

router.post("/open", verifyJWT, openChat);
router.get("/messages/:roomId", verifyJWT, getMyMessages);
router.get(
  "/my-rooms",
  verifyJWT, // your customer auth middleware
  getMyChatRooms,
);
router.put("/connect", verifyJWT, checkAgentAvailability, connectToAgent);
router.patch("/resolve", verifyJWT, resolveTicket);

export default router;
