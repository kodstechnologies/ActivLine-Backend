import admin from "firebase-admin";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Fix __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to JSON (optional fallback)
const serviceAccountPath = path.join(__dirname, "firebase-admin.json");

function loadServiceAccount() {
  // ✅ 1. PRIORITY → ENV VARIABLES (BEST FOR PRODUCTION)
  const {
    FIREBASE_PROJECT_ID,
    FIREBASE_CLIENT_EMAIL,
    FIREBASE_PRIVATE_KEY,
  } = process.env;

  if (FIREBASE_PROJECT_ID && FIREBASE_CLIENT_EMAIL && FIREBASE_PRIVATE_KEY) {
    return {
      projectId: FIREBASE_PROJECT_ID,       // ✅ FIXED KEY NAME
      clientEmail: FIREBASE_CLIENT_EMAIL,   // ✅ FIXED KEY NAME
      privateKey: FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    };
  }

  // ✅ 2. FALLBACK → LOCAL JSON (ONLY FOR LOCAL DEV)
  try {
    if (fs.existsSync(serviceAccountPath)) {
      const raw = fs.readFileSync(serviceAccountPath, "utf8");
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error("❌ Error reading firebase-admin.json:", err.message);
  }

  // ❌ If nothing works
  throw new Error(
    `Firebase service account not found. 
Expected ENV variables OR file at: ${serviceAccountPath}`
  );
}

const serviceAccount = loadServiceAccount();

// ✅ Initialize Firebase only once
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });

  console.log("✅ Firebase Admin initialized successfully");
}

// Export
export const firebaseAdmin = admin;
export default admin;