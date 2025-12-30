// api/delete-notebook.js
import { S3Client, ListObjectsV2Command, DeleteObjectsCommand } from "@aws-sdk/client-s3";

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_KEY,
  },
});

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { userId, notebookId } = req.body;
    const bucketName = "varapage"; // Your bucket name
    const folderPrefix = `${userId}/${notebookId}/`;

    // 1. List all files in the notebook folder
    const listCommand = new ListObjectsV2Command({
      Bucket: bucketName,
      Prefix: folderPrefix,
    });
    const listOutput = await r2.send(listCommand);

    // 2. If files exist, delete them
    if (listOutput.Contents && listOutput.Contents.length > 0) {
      const objectsToDelete = listOutput.Contents.map((obj) => ({ Key: obj.Key }));
      
      const deleteCommand = new DeleteObjectsCommand({
        Bucket: bucketName,
        Delete: { Objects: objectsToDelete },
      });
      await r2.send(deleteCommand);
    }

    res.status(200).json({ success: true });

  } catch (error) {
    console.error("Delete Error:", error);
    res.status(500).json({ error: 'Failed to delete files' });
  }
}