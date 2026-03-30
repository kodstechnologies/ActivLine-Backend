import admin from "firebase-admin";
import fs from "fs";
import path from "path";

// Firebase app instance
let firebaseAdmin;

const resolveServiceAccountFromEnv = () => {
  const serviceAccount = {
    project_id: process.env.FIREBASE_PROJECT_ID,
    client_email: process.env.FIREBASE_CLIENT_EMAIL,
    private_key: process.env.FIREBASE_PRIVATE_KEY,
  };

  if (
    serviceAccount.project_id &&
    serviceAccount.client_email &&
    serviceAccount.private_key
  ) {
    // Fix private key newline issue
    if (typeof serviceAccount.private_key === "string") {
      serviceAccount.private_key =
        serviceAccount.private_key.replace(/\\n/g, "\n");
    }
    return serviceAccount;
  }

  return null;
};

const resolveServiceAccountFromFile = () => {
  const explicitPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  const defaultPath = path.join(
    process.cwd(),
    "src",
    "config",
    "firebase-admin.json"
  );
  const candidatePath = explicitPath || defaultPath;

  if (!fs.existsSync(candidatePath)) {
    return { serviceAccount: null, path: candidatePath };
  }

  const raw = fs.readFileSync(candidatePath, "utf8");
  const parsed = JSON.parse(raw);
  return { serviceAccount: parsed, path: candidatePath };
};

try {
  if (admin.apps.length === 0) {
    let serviceAccount = resolveServiceAccountFromEnv();
    let source = "env";

    if (!serviceAccount) {
      const fromFile = resolveServiceAccountFromFile();
      serviceAccount = fromFile.serviceAccount;
      source = fromFile.path;
    }

    if (
      !serviceAccount ||
      !serviceAccount.project_id ||
      !serviceAccount.private_key ||
      !serviceAccount.client_email
    ) {
      throw new Error(
        "Missing required fields: project_id, private_key, client_email"
      );
    }

    firebaseAdmin = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });

    console.log(`Firebase Admin SDK initialized successfully (source: ${source})`);
  } else {
    firebaseAdmin = admin.app();
  }
} catch (error) {
  console.error("Firebase Admin SDK initialization error:", error.message);
  console.warn(
    "Firebase will not work. Provide FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY, or set FIREBASE_SERVICE_ACCOUNT_PATH to a valid JSON file."
  );
}

// Export
export default firebaseAdmin;
export { admin };
export { firebaseAdmin };
