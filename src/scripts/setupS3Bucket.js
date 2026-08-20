/**
 * scripts/setupS3Bucket.js
 *
 * One-time setup script — run ONCE before first deployment:
 *   node src/scripts/setupS3Bucket.js
 *
 * What it does:
 *  1. Disables Block Public Access settings on the bucket
 *  2. Applies a public-read bucket policy (GET only — upload still requires credentials)
 *  3. Enables CORS so browser uploads/downloads work
 */

import "dotenv/config";
import {
  S3Client,
  PutBucketPolicyCommand,
  PutPublicAccessBlockCommand,
  PutBucketCorsCommand,
  GetBucketLocationCommand,
} from "@aws-sdk/client-s3";

const BUCKET = process.env.AWS_S3_BUCKET_NAME;
const REGION = process.env.AWS_REGION;

if (!BUCKET || !REGION) {
  console.error(
    "❌ AWS_S3_BUCKET_NAME and AWS_REGION must be set in .env before running this script."
  );
  process.exit(1);
}

const s3 = new S3Client({
  region: REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

// ── 1. Disable Block Public Access ───────────────────────────────────────────
const disableBlockPublicAccess = async () => {
  console.log("⏳ Step 1/3 — Disabling Block Public Access...");
  await s3.send(
    new PutPublicAccessBlockCommand({
      Bucket: BUCKET,
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: false,
        IgnorePublicAcls: false,
        BlockPublicPolicy: false,
        RestrictPublicBuckets: false,
      },
    })
  );
  console.log("✅ Block Public Access disabled.");
};

// ── 2. Apply Bucket Policy (Public GET) ──────────────────────────────────────
const applyBucketPolicy = async () => {
  console.log("⏳ Step 2/3 — Applying public-read bucket policy...");

  const policy = {
    Version: "2012-10-17",
    Statement: [
      {
        Sid: "PublicReadGetObject",
        Effect: "Allow",
        Principal: "*",
        Action: "s3:GetObject",
        Resource: `arn:aws:s3:::${BUCKET}/*`,
      },
    ],
  };

  await s3.send(
    new PutBucketPolicyCommand({
      Bucket: BUCKET,
      Policy: JSON.stringify(policy),
    })
  );

  console.log(`✅ Bucket policy applied → s3://${BUCKET}/* is now publicly readable.`);
};

// ── 3. Configure CORS ─────────────────────────────────────────────────────────
const configureCORS = async () => {
  console.log("⏳ Step 3/3 — Configuring CORS...");

  await s3.send(
    new PutBucketCorsCommand({
      Bucket: BUCKET,
      CORSConfiguration: {
        CORSRules: [
          {
            AllowedOrigins: ["*"],          // Restrict to your domain in production
            AllowedMethods: ["GET", "PUT", "POST", "DELETE", "HEAD"],
            AllowedHeaders: ["*"],
            ExposeHeaders: ["ETag", "Content-Length"],
            MaxAgeSeconds: 3000,
          },
        ],
      },
    })
  );

  console.log("✅ CORS configured.");
};

// ── Verify bucket is accessible ───────────────────────────────────────────────
const verifyBucket = async () => {
  const location = await s3.send(new GetBucketLocationCommand({ Bucket: BUCKET }));
  const region = location.LocationConstraint || "us-east-1"; // us-east-1 returns null
  console.log(`\n📦 Bucket   : ${BUCKET}`);
  console.log(`🌏 Region   : ${region}`);
  console.log(`🔗 Base URL : https://${BUCKET}.s3.${region}.amazonaws.com`);
};

// ── Run all steps ─────────────────────────────────────────────────────────────
const run = async () => {
  console.log(`\n🚀 Setting up S3 bucket: ${BUCKET}\n`);

  try {
    await verifyBucket();
    console.log("");
    await disableBlockPublicAccess();
    await applyBucketPolicy();
    await configureCORS();

    console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅  S3 Bucket Setup Complete!

  Bucket      : ${BUCKET}
  Region      : ${REGION}
  Public URL  : https://${BUCKET}.s3.${REGION}.amazonaws.com/{key}

  - Objects are publicly readable (GET)
  - Uploads still require AWS credentials (secure)
  - CORS is configured for browser access
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    `);
  } catch (err) {
    console.error("\n❌ Setup failed:", err.message);
    console.error("\nCommon causes:");
    console.error("  • Invalid AWS credentials in .env");
    console.error("  • Bucket does not exist — create it in AWS Console first");
    console.error("  • IAM user lacks s3:PutBucketPolicy / s3:PutPublicAccessBlock permissions");
    process.exit(1);
  }
};

run();
