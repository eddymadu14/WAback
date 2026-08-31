import 'dotenv/config'; // loads process.env automatically
import { S3Client, ListBucketsCommand } from "@aws-sdk/client-s3";

// Using API Token instead of Access Key/Secret
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_API_TOKEN = process.env.R2_API_TOKEN;

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_API_TOKEN,  // Use token as accessKeyId
    secretAccessKey: "",         // Leave secret empty
  },
});

async function checkR2Connection() {
  try {
    const result = await r2.send(new ListBucketsCommand({}));
    console.log("✅ R2 connection successful!");
    console.log("Buckets:", result.Buckets.map(b => b.Name));
  } catch (err) {
    console.error("❌ Failed to connect to R2:", err);
  }
}

checkR2Connection();