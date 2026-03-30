import admin from "firebase-admin";
import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

// Fix __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Firebase app instance
let firebaseAdmin;

try {
  if (admin.apps.length === 0) {

    const serviceAccount = {
      project_id: process.env.FIREBASE_PROJECT_ID,
      client_email: process.env.FIREBASE_CLIENT_EMAIL,
      private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    };

    // Validate required fields
    if (
      !serviceAccount.project_id ||
      !serviceAccount.private_key ||
      !serviceAccount.client_email
    ) {
      throw new Error(
        "Missing required fields: project_id, private_key, client_email"
      );
    }

    // Fix private key newline issue
    if (typeof serviceAccount.private_key === "string") {
      serviceAccount.private_key =
        serviceAccount.private_key.replace(/\\n/g, "\n");
    }

    // Initialize Firebase
    firebaseAdmin = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });

    console.log("✅ Firebase Admin SDK initialized successfully");

  } else {
    firebaseAdmin = admin.app();
  }

} catch (error) {
  console.error("❌ Firebase Admin SDK initialization error:", error.message);
  console.warn(
    "⚠️ Firebase will not work. Make sure firebase-admin.json exists in src/config"
  );
}

// Export
export default firebaseAdmin;
export { admin };
export { firebaseAdmin };