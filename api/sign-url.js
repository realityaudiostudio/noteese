// api/sign-url.js
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_KEY,
  },
});

export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { fileName, fileType } = req.body;

    const command = new PutObjectCommand({
      Bucket: "varapage", // Your actual bucket name
      Key: fileName,
      ContentType: fileType,
    });

    // Generate a secure URL valid for 60 seconds
    const signedUrl = await getSignedUrl(r2, command, { expiresIn: 60 });

    res.status(200).json({ url: signedUrl });
  } catch (error) {
    console.error("Error generating signed URL:", error);
    res.status(500).json({ error: 'Error generating upload URL' });
  }
}