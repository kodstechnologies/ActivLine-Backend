import Joi from "joi";

export const createCustomerSchema = Joi.object({
  userGroupId: Joi.number().required(),

  accountId: Joi.string().required(),

  userName: Joi.string().min(3).optional().allow(""),

  password: Joi.string().min(6).optional().allow(""),

  phoneNumber: Joi.string()
    .pattern(/^[6-9]\d{9}$/)
    .required(),

  emailId: Joi.string().email().optional(),

  userState: Joi.string().optional(),
  userType: Joi.string().valid("home", "business").optional(),

  activationDate: Joi.string().optional(),

  firstName: Joi.string().optional(),
  lastName: Joi.string().optional(),

  address_line1: Joi.string().optional(),
  address_city: Joi.string().optional(),
  address_pin: Joi.string().optional(),
  address_state: Joi.string().optional(),
  address_country: Joi.string().length(2).optional(),
  referralCode: Joi.string().optional(),

  notifyUserSms: Joi.string().valid("on", "off").optional(),
});
