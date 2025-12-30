// api/sign-url.js
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export default async function handler(req, res) {
  console.log("--- DEBUGGING KEYS ---");
  console.log("Account ID:", process.env.R2_ACCOUNT_ID ? "✅ Loaded" : "❌ MISSING");
  console.log("Access Key:", process.env.R2_ACCESS_KEY_ID ? "✅ Loaded" : "❌ MISSING");
  console.log("Secret Key:", process.env.R2_SECRET_KEY ? "✅ Loaded" : "❌ MISSING");

  // Move S3Client INSIDE handler to ensure it picks up fresh env vars
  const r2 = new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID || ''}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
      secretAccessKey: process.env.R2_SECRET_KEY || '',
    },
  });

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { fileName, fileType } = req.body;
    
    // Check if filename exists to prevent empty errors
    if (!fileName) throw new Error("Filename is missing from request body");

    const command = new PutObjectCommand({
      Bucket: "varapage",
      Key: fileName,
      ContentType: fileType,
    });

    const signedUrl = await getSignedUrl(r2, command, { expiresIn: 60 });
    res.status(200).json({ url: signedUrl });
    
  } catch (error) {
    console.error("FULL ERROR DETAILS:", error); // This prints the real error
    res.status(500).json({ error: error.message });
  }
}