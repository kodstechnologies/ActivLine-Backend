import admin from "firebase-admin";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

if (!admin.apps.length) {
  const serviceAccountPath = path.join(__dirname, "../../firebase-admin.json");

  const hasEnv =
    Boolean(process.env.FIREBASE_PROJECT_ID) &&
    Boolean(process.env.FIREBASE_CLIENT_EMAIL) &&
    Boolean(process.env.FIREBASE_PRIVATE_KEY);

  if (!fs.existsSync(serviceAccountPath) && !hasEnv) {
    console.error("❌ Firebase Admin initialization failed: Service account file not found.");
    console.error(`   The server expected to find the file at: "${serviceAccountPath}"`);
    console.error("   Please ensure 'firebase-admin.json' is in the project root directory.");
    // process.exit(1);
  }

  if (!fs.existsSync(serviceAccountPath) && hasEnv) {
    const privateKey = String(process.env.FIREBASE_PRIVATE_KEY).replace(
      /\\n/g,
      "\n"
    );

    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey,
      }),
    });
  }

  if (fs.existsSync(serviceAccountPath)) {
  const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
  console.log("✅ Firebase Admin initialized successfully");
  }
}

export const firebaseAdmin = admin;
