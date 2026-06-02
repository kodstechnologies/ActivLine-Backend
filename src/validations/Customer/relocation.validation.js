import Joi from "joi";

export const createRelocationSchema = Joi.object({
  installation_address_line2: Joi.string().required().trim(),
  installation_address_city: Joi.string().required().trim(),
  installation_address_pin: Joi.string().required().trim(),
  installation_address_state: Joi.string().required().trim(),
  installation_address_country: Joi.string().optional().trim().default("India"),
  longitude: Joi.number().optional().allow(null),
  latitude: Joi.number().optional().allow(null),
  sifted_date: Joi.date().required(),
  userGroupId: Joi.alternatives().try(Joi.string(), Joi.number()).required(),
  accountId: Joi.string().required(),
});

export const updateRelocationSchema = Joi.object({
  installation_address_line2: Joi.string().optional().trim(),
  installation_address_city: Joi.string().optional().trim(),
  installation_address_pin: Joi.string().optional().trim(),
  installation_address_state: Joi.string().optional().trim(),
  installation_address_country: Joi.string().optional().trim(),
  longitude: Joi.number().optional().allow(null),
  latitude: Joi.number().optional().allow(null),
  sifted_date: Joi.date().optional(),
  userGroupId: Joi.alternatives().try(Joi.string(), Joi.number()).optional(),
  accountId: Joi.string().optional(),
  status: Joi.string().valid("REQUEST", "PENDING", "COMPLETED").optional(),
});
