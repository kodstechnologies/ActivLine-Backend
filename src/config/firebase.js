import admin from "firebase-admin";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Fix __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to your JSON file
const serviceAccountPath = path.join(__dirname, "./firebase-admin.json");

// Load JSON directly
function loadServiceAccount() {
  try {
    if (fs.existsSync(serviceAccountPath)) {
      const raw = fs.readFileSync(serviceAccountPath, "utf8");
      return JSON.parse(raw);
    } else {
      throw new Error("firebase-admin.json file not found");
    }
  } catch (err) {
    console.error("❌ Error loading Firebase service account:", err.message);
    throw err;
  }
}

const serviceAccount = loadServiceAccount();

// Initialize Firebase only once
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });

  console.log("✅ Firebase Admin initialized successfully");
}

// Export
export const firebaseAdmin = admin;
export default admin;