import "dotenv/config";
import http from "http";
import axios from "axios";
import "./src/config/firebase.js"; // Ensure Firebase is initialized first
// import { Server } from 'socket.io';
import connectDB from "./src/db/index.js";
import app from "./app.js";
import Admin from "./src/models/auth/auth.model.js";
import Customer from "./src/models/Customer/customer.model.js";
import { initSocket } from "./src/socket/index.js";
import { sendMessage } from "./src/utils/sendMessage.js";
import { startPlanExpiryCron, startNextDayRechargeCron, startCustomerMaintenanceCron } from "./src/jobs/planExpiryJob.js";
import { startAgentAvailabilityCron } from "./src/jobs/agentAvailabilityJob.js";
import { startDailyDataUsageCron } from "./src/jobs/dailyDataUsageJob.js";

// Activline Credentials (fallback if .env is missing or invalid)
const ACTIVLINE_USERNAME = "gmai";
const ACTIVLINE_PASSWORD = "25bd1d0cfa2b8428341187c5d9f0f7763763489d";

/**
 * Verify Activline credentials by testing against Activline API
 */
const verifyActivlineCredentials = async (username, password) => {
  if (!username || !password) return { success: false, reason: "Missing username or password" };
  try {
    const auth = Buffer.from(`${username}:${password}`).toString("base64");
    const response = await axios.get("https://live.activline.in/api/v1/get_all_profile_ids", {
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: "application/json",
      },
      timeout: 10000,
    });
    if (response.status === 200) {
      return { success: true };
    }
    return { success: false, reason: `HTTP status ${response.status}` };
  } catch (error) {
    const status = error?.response?.status;
    const msg = error?.response?.data?.message || error?.message || "Unknown error";
    return { success: false, reason: status ? `HTTP ${status}` : msg };
  }
};

/**
 * Check .env credentials first. If they work, keep them.
 * Otherwise, fallback to the hardcoded credentials in server.js and verify them.
 */
const setupActivlineCredentials = async () => {
  console.log("🔍 Checking Activline credentials...");

  const envUsername = process.env.ACTIVLINE_USERNAME;
  const envPassword = process.env.ACTIVLINE_PASSWORD;

  if (envUsername && envPassword) {
    console.log(`Checking .env Activline credentials for user: ${envUsername}...`);
    const envCheck = await verifyActivlineCredentials(envUsername, envPassword);
    if (envCheck.success) {
      console.log(`✅ Activline .env credentials verified and working (${envUsername}).`);
      return;
    }
    console.warn(`⚠️ Activline .env credentials failed check (${envCheck.reason}).`);
  } else {
    console.warn("⚠️ Activline credentials not found in .env.");
  }

  console.log(`🔄 Switching to fallback Activline credentials from server.js ('${ACTIVLINE_USERNAME}')...`);
  const fallbackCheck = await verifyActivlineCredentials(
    ACTIVLINE_USERNAME,
    ACTIVLINE_PASSWORD
  );

  if (fallbackCheck.success) {
    console.log(`✅ Activline fallback credentials verified and working ('${ACTIVLINE_USERNAME}').`);
  } else {
    console.error(`❌ Activline fallback credentials check failed (${fallbackCheck.reason})!`);
  }

  process.env.ACTIVLINE_USERNAME = ACTIVLINE_USERNAME;
  process.env.ACTIVLINE_PASSWORD = ACTIVLINE_PASSWORD;
};

const startServer = async () => {
  try {
    if (!process.env.ACCESS_TOKEN_SECRET) {
      console.error("❌ FATAL: ACCESS_TOKEN_SECRET is missing in .env");
      process.exit(1);
    }
    await setupActivlineCredentials();
    await connectDB();

    // Sync indexes to remove the unused 'phone_1' index causing duplicate key errors
    await Admin.syncIndexes();
    await Customer.syncIndexes();

    const server = http.createServer(app);
    // const io = new Server(server, {
    //     cors: {
    //         origin: "*",
    //         methods: ["GET", "POST"],
    //         credentials: true,
    //     },
    // });

    initSocket(server);
    startPlanExpiryCron();
    startNextDayRechargeCron();
    startCustomerMaintenanceCron();
    startAgentAvailabilityCron();
    startDailyDataUsageCron();

    const shutdown = (signal) => {
      console.log(`Shutting down server due to ${signal}...`);
      server.close(() => {
        process.exit(0);
      });
      setTimeout(() => process.exit(1), 5000).unref();
    };

    // Allow nodemon to restart cleanly without leaving the port open
    process.once("SIGUSR2", () => shutdown("SIGUSR2"));
    process.once("SIGINT", () => shutdown("SIGINT"));
    process.once("SIGTERM", () => shutdown("SIGTERM"));

    const port = process.env.PORT || 8000;

    console.log(port);

    server.on("error", (error) => {
      if (error.code === "EADDRINUSE") {
        console.error(
          `ERROR: Port ${port} is already in use. Stop the other process or change PORT in .env.`,
        );
      } else {
        console.error("ERROR: Server error:", error);
      }
      process.exit(1);
    });

    server.listen(port, "0.0.0.0", () => {
      console.log(
        `🚀!! Server running on ${port} at ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}`,
      );
    });
  } catch (err) {
    console.error("Server startup failed:", err);
    process.exit(1);
  }
};
startServer();
