import DailyDataUsage from "../../models/Customer/dailyDataUsage.model.js";

export const getLatestLog = (customerId) =>
  DailyDataUsage.findOne({ customer: customerId }).sort({ date: -1 });

export const getHistoryByCustomer = (customerId) =>
  DailyDataUsage.find({ customer: customerId }).sort({ date: 1 });

export const upsertLog = (customerId, date, payload) =>
  DailyDataUsage.findOneAndUpdate(
    { customer: customerId, date },
    { $set: payload },
    { new: true, upsert: true }
  );

export const deleteLogsByCustomer = (customerId) =>
  DailyDataUsage.deleteMany({ customer: customerId });
