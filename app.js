import "dotenv/config";
import express from "express";
import cors from "cors";
import routes from "./src/routes/index.route.js";
import paymentRoutes from "./src/routes/payment/index.js";
import ApiError from "./src/utils/ApiError.js";
import cookieParser from "cookie-parser";
import path from "path";
const app = express();

app.use(
  cors({
    origin: (origin, callback) => {
      const allowedOrigins = [
        "http://localhost:3000",
        "http://localhost:5173",
        "http://localhost:5174",
        "http://127.0.0.1:64255",
         "http://localhost:8000"
      ];

      // 1. Allow requests with no origin (like mobile apps, Postman, or curl)
      if (!origin || origin === "null") {
        return callback(null, true);
      }

      if (
        allowedOrigins.includes(origin) ||
        origin.startsWith("http://localhost") ||
        origin.startsWith("http://127.0.0.1")
      ) {
        return callback(null, true);
      }

      callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);





// app.options("/*", cors({
//   origin: (origin, callback) => {
//     const allowedOrigins = [
//       "http://localhost:3000",
//       "http://localhost:5173",
//       "http://localhost:5174",
//       "http://127.0.0.1:64255",
//     ];

//     if (!origin || allowedOrigins.includes(origin)) {
//       callback(null, true);
//     } else {
//       callback(new Error("Not allowed by CORS"));
//     }
//   },
//   credentials: true,
// }));

// ✅ preflight support
// app.options("*", cors());

app.use(express.json({ limit: "16kb" }));
app.use(express.urlencoded({ extended: true, limit: "16kb" }));
app.use(cookieParser());
app.use(
  "/uploads/chat",
  express.static(path.join(process.cwd(), "uploads/chat"))
);
app.use("/", paymentRoutes);
app.use("/api", routes);

// Test Route
app.get("/test", (req, res) => {

    // Send it in the response
    res.json({
        success: true,
        message: `Server is working!!`,
        timestamp: new Date().toISOString(),
    });
});

// Basic Error Handler
app.use((err, req, res, next) => {
    console.error("❌ Server Error:", err);

    // Handle multer file size errors
    if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(413).json({
            success: false,
            message: "File too large. Maximum file size is 500MB",
            data: null,
        });
    }

    // Handle multer file type errors
    if (err.message && (err.message.includes("video files") || err.message.includes("Only video files"))) {
        return res.status(400).json({
            success: false,
            message: err.message,
            data: null,
        });
    }

    // Handle multer "Unexpected field" error (wrong field name)
    if (err.code === "LIMIT_UNEXPECTED_FILE") {
        return res.status(400).json({
            success: false,
            message: "Invalid field name. Use 'video' as the field name for file upload.",
            data: null,
        });
    }

    // If it's an instance of ApiError → use its structure
    if (err instanceof ApiError) {
        return res.status(err.statusCode).json(err.toJSON());
    }

    // ✅ Handle JWT errors globally (Expired/Invalid)
    if (err.name === "TokenExpiredError" || err.name === "JsonWebTokenError") {
        return res.status(401).json({
            success: false,
            message: "401 Invalid or expired access token",
            data: null,
        });
    }

    // Otherwise, fallback to generic
    res.status(500).json({
        success: false,
        message: err.message || "Internal Server Error",
        data: null,
    });
});

export default app;
