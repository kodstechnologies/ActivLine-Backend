import * as dailyDataUsageRepo from "../../repositories/Customer/dailyDataUsage.repository.js";
import Customer from "../../models/Customer/customer.model.js";
import { getUserByUsername } from "../../external/activline/activline.profile.api.js";

const getLocalDateString = () => {
  const date = new Date();
  const formatter = new Intl.DateTimeFormat("en-ZA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(date).replace(/\//g, "-");
};

export const recordDailyUsage = async (customer, cumulativeVolumeGB) => {
  const customerId = customer._id;
  const username = customer.userName || customer.activlineUserId || "Unknown";
  const dateStr = getLocalDateString();

  // Find the previous record to compute the net daily consumption
  const previousLog = await dailyDataUsageRepo.getLatestLog(customerId);

  let dailyVolumeGB = 0;

  if (!previousLog) {
    // First record: assume consumed usage is the current cumulative or 0
    dailyVolumeGB = Math.max(0, cumulativeVolumeGB);
  } else {
    if (cumulativeVolumeGB >= previousLog.cumulativeVolumeGB) {
      dailyVolumeGB = cumulativeVolumeGB - previousLog.cumulativeVolumeGB;
    } else {
      // Cumulative usage reset (indicates plan expired/renewed or quota reset)
      dailyVolumeGB = cumulativeVolumeGB;
    }
  }

  // Ensure precision to 2 decimal places to avoid floating point errors
  dailyVolumeGB = parseFloat(dailyVolumeGB.toFixed(3));
  const cumulativeVolumeGBFixed = parseFloat(cumulativeVolumeGB.toFixed(3));

  const payload = {
    username,
    cumulativeVolumeGB: cumulativeVolumeGBFixed,
    dailyVolumeGB,
  };

  return await dailyDataUsageRepo.upsertLog(customerId, dateStr, payload);
};

export const getPlanUsageHistory = async (customerId) => {
  // 1. Fetch raw logs history from the repository
  const rawHistory = await dailyDataUsageRepo.getHistoryByCustomer(customerId);
  const history = (rawHistory || []).map((log) => ({
    date: log.date,
    dataUsedGB: log.dailyVolumeGB,
    cumulativeVolumeGB: log.cumulativeVolumeGB || 0,
  }));

  // 2. Query customer details to fetch live data
  const customer = await Customer.findById(customerId).select("userName");
  if (customer?.userName) {
    let liveUsedVolume = 0;
    let fetchSuccess = false;
    try {
      const userRes = await getUserByUsername(customer.userName);
      const getInnerArray = (res) => {
        if (!res) return [];
        if (Array.isArray(res)) {
          if (Array.isArray(res[0])) return res[0];
          return res;
        }
        if (Array.isArray(res.data)) return res.data;
        return [];
      };
      const inner = getInnerArray(userRes);
      const usageObj = inner.find(
        (item) => item && item.currentBillingCycleUsage,
      );
      if (usageObj?.currentBillingCycleUsage) {
        liveUsedVolume =
          parseFloat(usageObj.currentBillingCycleUsage.totalDataUsage) || 0;
        fetchSuccess = true;
      }
    } catch (err) {
      console.error("Failed to fetch live usage for history:", err.message);
    }

    if (fetchSuccess) {
      const todayStr = getLocalDateString();
      const existingToday = history.find((log) => log.date === todayStr);

      if (existingToday) {
        // Update existing today log with live data
        const todayIndex = history.findIndex((log) => log.date === todayStr);
        const secondLatestLog = todayIndex > 0 ? history[todayIndex - 1] : null;

        let todayDailyUsage = 0;
        if (secondLatestLog) {
          if (liveUsedVolume >= secondLatestLog.cumulativeVolumeGB) {
            todayDailyUsage =
              liveUsedVolume - secondLatestLog.cumulativeVolumeGB;
          } else {
            todayDailyUsage = liveUsedVolume;
          }
        } else {
          todayDailyUsage = liveUsedVolume;
        }
        existingToday.dataUsedGB = parseFloat(todayDailyUsage.toFixed(3));
        existingToday.cumulativeVolumeGB = parseFloat(
          liveUsedVolume.toFixed(3),
        );
      } else {
        // Append today's active live usage log
        const latestLog =
          history.length > 0 ? history[history.length - 1] : null;
        let todayDailyUsage = 0;
        if (latestLog) {
          if (liveUsedVolume >= latestLog.cumulativeVolumeGB) {
            todayDailyUsage = liveUsedVolume - latestLog.cumulativeVolumeGB;
          } else {
            todayDailyUsage = liveUsedVolume;
          }
        } else {
          todayDailyUsage = liveUsedVolume;
        }
        history.push({
          date: todayStr,
          dataUsedGB: parseFloat(todayDailyUsage.toFixed(3)),
          cumulativeVolumeGB: parseFloat(liveUsedVolume.toFixed(3)),
        });
      }
    }
  }

  // 3. Map to final output format containing weekday names
  const getDayOfWeek = (dateStr) => {
    const parts = dateStr.split("-");
    if (parts.length === 3) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      const date = new Date(year, month, day);
      return date.toLocaleDateString("en-US", { weekday: "long" });
    }
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", { weekday: "long" });
  };

  const todayStr = getLocalDateString();
  const historyMapped = history.map((log) => ({
    date: log.date,
    day: getDayOfWeek(log.date),
    dataUsedGB: log.dataUsedGB,
  }));

  // Find today's usage entry to put outside the array
  const todayEntry = historyMapped.find((log) => log.date === todayStr) || {
    date: todayStr,
    day: getDayOfWeek(todayStr),
    dataUsedGB: 0,
  };

  // Calculate total data usage of this month till today
  const currentMonthStr = todayStr.substring(0, 7); // Format: "YYYY-MM"
  const thisMonthLogs = historyMapped.filter((log) =>
    log.date.startsWith(currentMonthStr),
  );
  const totalUsageThisMonth = thisMonthLogs.reduce(
    (sum, log) => sum + log.dataUsedGB,
    0,
  );
  const averageUsageThisMonth =
    thisMonthLogs.length > 0 ? totalUsageThisMonth / thisMonthLogs.length : 0;

  // 4. Generate the current calendar week starting from Monday to Sunday
  const todayParts = todayStr.split("-");
  const tYear = parseInt(todayParts[0], 10);
  const tMonth = parseInt(todayParts[1], 10) - 1;
  const tDayNum = parseInt(todayParts[2], 10);
  const todayDateObj = new Date(tYear, tMonth, tDayNum);
  const todayDayOfWeek = todayDateObj.getDay(); // 0 = Sunday, 1 = Monday, ...

  // Calculate days to subtract to reach Monday
  const daysSinceMonday = todayDayOfWeek === 0 ? 6 : todayDayOfWeek - 1;
  const mondayDateObj = new Date(todayDateObj);
  mondayDateObj.setDate(todayDateObj.getDate() - daysSinceMonday);

  const weeklyDates = [];
  const weekdayNames = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
  ];

  for (let i = 0; i < 7; i++) {
    const nextDate = new Date(mondayDateObj);
    nextDate.setDate(mondayDateObj.getDate() + i);

    const y = nextDate.getFullYear();
    const m = String(nextDate.getMonth() + 1).padStart(2, "0");
    const d = String(nextDate.getDate()).padStart(2, "0");
    const dateString = `${y}-${m}-${d}`;

    weeklyDates.push({
      date: dateString,
      day: weekdayNames[i],
    });
  }

  // Map history logs into the current week's Monday-Sunday slots
  const last7DaysUsage = weeklyDates.map((wDate) => {
    const record = historyMapped.find((log) => log.date === wDate.date);
    return {
      date: wDate.date,
      day: wDate.day,
      dataUsedGB: record ? record.dataUsedGB : 0,
    };
  });

  // 5. Aggregate daily usage logs into monthly buckets for the past 1 year
  const getMonthName = (yearMonthStr) => {
    const parts = yearMonthStr.split("-");
    if (parts.length === 2) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const date = new Date(year, month, 1);
      return date.toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
      });
    }
    return yearMonthStr;
  };

  const monthlyGroups = {};
  history.forEach((log) => {
    const monthKey = log.date.substring(0, 7); // "YYYY-MM"
    monthlyGroups[monthKey] = (monthlyGroups[monthKey] || 0) + log.dataUsedGB;
  });

  const yearlyMonthlyUsage = Object.entries(monthlyGroups)
    .map(([monthKey, dataUsedGB]) => ({
      month: getMonthName(monthKey),
      dataUsedGB: parseFloat(dataUsedGB.toFixed(3)),
    }))
    .sort((a, b) => new Date(a.month) - new Date(b.month))
    .slice(-12);

  return {
    todayUsage: todayEntry,
    totalUsageThisMonthGB: parseFloat(totalUsageThisMonth.toFixed(3)),
    averageUsageThisMonthGB: parseFloat(averageUsageThisMonth.toFixed(3)),
    last7DaysUsage,
    yearlyMonthlyUsage,
  };
};

export const resetUsageHistory = async (customerId) => {
  return await dailyDataUsageRepo.deleteLogsByCustomer(customerId);
};
