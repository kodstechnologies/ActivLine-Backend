import admin from "firebase-admin";
import "dotenv/config";
import fs from "fs";
import path from "path";

// Firebase app instance
let firebaseAdmin = null;

const formatPrivateKey = (key) => {
  if (!key || typeof key !== "string") return key;

  let cleaned = key.trim();

  // Strip wrapping quotes if present
  if (
    (cleaned.startsWith('"') && cleaned.endsWith('"')) ||
    (cleaned.startsWith("'") && cleaned.endsWith("'"))
  ) {
    cleaned = cleaned.slice(1, -1).trim();
  }

  // Remove escaped quotes
  cleaned = cleaned.replace(/\\"/g, '"');

  // Replace literal '\n' and '\r\n' sequences with real newlines
  cleaned = cleaned.replace(/\\r\\n/g, "\n");
  cleaned = cleaned.replace(/\\n/g, "\n");
  cleaned = cleaned.replace(/\r\n/g, "\n");
  cleaned = cleaned.replace(/\r/g, "\n");

  // Ensure header and footer have proper newline boundaries
  const beginMarker = "-----BEGIN PRIVATE KEY-----";
  const endMarker = "-----END PRIVATE KEY-----";
  if (cleaned.includes(beginMarker) && cleaned.includes(endMarker)) {
    const startIndex = cleaned.indexOf(beginMarker) + beginMarker.length;
    const endIndex = cleaned.indexOf(endMarker);
    const body = cleaned.substring(startIndex, endIndex).trim();
    cleaned = `${beginMarker}\n${body}\n${endMarker}\n`;
  }

  return cleaned;
};

const resolveServiceAccount = () => {
  // 1. Check if a JSON file path is specified
  const serviceAccountPath =
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH ||
    (fs.existsSync(path.resolve(process.cwd(), "serviceAccountKey.json"))
      ? path.resolve(process.cwd(), "serviceAccountKey.json")
      : null);

  if (serviceAccountPath && fs.existsSync(path.resolve(serviceAccountPath))) {
    try {
      const fileContent = fs.readFileSync(
        path.resolve(serviceAccountPath),
        "utf8"
      );
      const parsed = JSON.parse(fileContent);
      return { serviceAccount: parsed, source: `file (${serviceAccountPath})` };
    } catch (err) {
      console.warn(
        `Failed to parse service account JSON from file: ${serviceAccountPath}`,
        err.message
      );
    }
  }

  // 2. Check if a raw JSON string is provided in env
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      const parsed = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      return { serviceAccount: parsed, source: "env JSON string" };
    } catch (err) {
      console.warn("Failed to parse FIREBASE_SERVICE_ACCOUNT JSON string");
    }
  }

  // 3. Check individual environment variables
  const projectId =
    process.env.FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECTID;
  const clientEmail =
    process.env.FIREBASE_CLIENT_EMAIL || process.env.FIREBASE_CLIENTEMAIL;
  const privateKey =
    process.env.FIREBASE_PRIVATE_KEY || process.env.FIREBASE_PRIVATEKEY;

  if (projectId && clientEmail && privateKey) {
    return {
      serviceAccount: {
        projectId,
        clientEmail,
        privateKey: formatPrivateKey(privateKey),
      },
      source: "env variables",
    };
  }

  return { serviceAccount: null, source: null };
};

try {
  if (admin.apps.length === 0) {
    const { serviceAccount, source } = resolveServiceAccount();

    if (
      !serviceAccount ||
      (!serviceAccount.projectId && !serviceAccount.project_id) ||
      (!serviceAccount.privateKey && !serviceAccount.private_key) ||
      (!serviceAccount.clientEmail && !serviceAccount.client_email)
    ) {
      throw new Error(
        "Missing required fields: project_id, private_key, client_email"
      );
    }

    firebaseAdmin = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });

    console.log(
      `Firebase Admin SDK initialized successfully (source: ${source})`
    );
  } else {
    firebaseAdmin = admin.app();
  }
} catch (error) {
  console.error("Firebase Admin SDK initialization error:", error.message);
  console.warn(
    "Firebase will not work. Provide valid FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY in .env, or set FIREBASE_SERVICE_ACCOUNT_PATH to a valid JSON file."
  );
}

// Export
export default firebaseAdmin;
export { admin };
export { firebaseAdmin };

