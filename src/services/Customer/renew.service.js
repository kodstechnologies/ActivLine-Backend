import { renewPlan } from "../../external/activline/activline.renew.api.js";

export const renewUserPlan = async (payload) => {
  return renewPlan(payload);
};
