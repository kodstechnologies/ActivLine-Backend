// src/validations/chat/chat.validation.js
import Joi from "joi";

export const assignStaffSchema = Joi.object({
  roomId: Joi.string().required(),
  staffId: Joi.string().allow(null, "").optional(),
});



export const updateTicketStatusSchema = Joi.object({
  roomId: Joi.string().required(),
  status: Joi.string()
    .valid("OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED")
    .required(),
});
