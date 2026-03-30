import admin from "firebase-admin";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Fix __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Preferred path to JSON (same folder)
const serviceAccountPath = path.join(__dirname, "./firebase-admin.json");

function loadServiceAccount() {
  // 1) Try local JSON file
  try {
    const raw = fs.readFileSync(serviceAccountPath, "utf8");
    return JSON.parse(raw);
  } catch (err) {
    // Fall through to env-based config
  }

  // 2) Fallback to env vars (useful for CI/servers)
  const {
    FIREBASE_PROJECT_ID,
    FIREBASE_CLIENT_EMAIL,
    FIREBASE_PRIVATE_KEY,
  } = process.env;

  if (FIREBASE_PROJECT_ID && FIREBASE_CLIENT_EMAIL && FIREBASE_PRIVATE_KEY) {
    return {
      project_id: FIREBASE_PROJECT_ID,
      client_email: FIREBASE_CLIENT_EMAIL,
      private_key: FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    };
  }

  throw new Error(
    `Firebase service account not found. Expected file at "${serviceAccountPath}" or env vars FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY.`
  );
} 

const serviceAccount = loadServiceAccount();

// Initialize Firebase (only once)
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
 
  console.log("✅ Firebase Admin initialized successfully");
}

export const firebaseAdmin = admin;
