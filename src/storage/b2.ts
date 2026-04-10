/**
 * Meal images are stored on Backblaze B2 using the official B2 HTTP API
 * (via the `backblaze-b2` package). No AWS services are used.
 */
import path from "path";
import { randomUUID } from "crypto";
import B2 from "backblaze-b2";

let client: B2 | null = null;

function getClient(): B2 {
  if (!client) {
    const applicationKeyId = process.env.B2_APPLICATION_KEY_ID;
    const applicationKey = process.env.B2_APPLICATION_KEY;
    if (!applicationKeyId || !applicationKey) {
      throw new Error("B2_APPLICATION_KEY_ID and B2_APPLICATION_KEY must be set");
    }
    client = new B2({ applicationKeyId, applicationKey });
  }
  return client;
}

/** B2 file names use `/` as path separators; URL path must encode each segment. */
function encodeB2FilePathForUrl(fileName: string): string {
  return fileName.split("/").map(encodeURIComponent).join("/");
}

export async function uploadMealImageToB2(
  buffer: Buffer,
  contentType: string,
  originalFileName: string,
): Promise<{ imageUrl: string; b2FileName: string; fileId: string }> {
  const bucketId = process.env.B2_BUCKET_ID;
  const bucketName = process.env.B2_BUCKET_NAME;
  if (!bucketId || !bucketName) {
    throw new Error("B2_BUCKET_ID and B2_BUCKET_NAME must be set");
  }

  const b2 = getClient();
  await b2.authorize();
  if (!b2.downloadUrl) {
    throw new Error("B2 authorize did not return downloadUrl");
  }

  const { data: uploadTarget } = await b2.getUploadUrl({ bucketId });
  const ext = path.extname(originalFileName) || ".jpg";
  const b2FileName = `meals/${randomUUID()}${ext}`;

  const uploadRes = await b2.uploadFile({
    uploadUrl: uploadTarget.uploadUrl,
    uploadAuthToken: uploadTarget.authorizationToken,
    fileName: b2FileName,
    data: buffer,
    mime: contentType,
  });

  const uploadData = uploadRes.data as { fileId: string; fileName: string };
  const fileId = uploadData.fileId;

  const baseFromEnv = process.env.B2_PUBLIC_FILE_BASE_URL?.replace(/\/$/, "");
  const imageUrl = baseFromEnv
    ? `${baseFromEnv}/${encodeB2FilePathForUrl(b2FileName)}`
    : `${b2.downloadUrl}/file/${encodeURIComponent(bucketName)}/${encodeB2FilePathForUrl(b2FileName)}`;

  return { imageUrl, b2FileName, fileId };
}

/** Best-effort delete of the image in B2 (ignores missing-file errors). */
export async function deleteMealFileFromB2(fileId: string, fileName: string): Promise<void> {
  try {
    const b2 = getClient();
    await b2.authorize();
    await (
      b2 as unknown as {
        deleteFileVersion: (args: { fileId: string; fileName: string }) => Promise<unknown>;
      }
    ).deleteFileVersion({ fileId, fileName });
  } catch (err) {
    console.error("B2 deleteFileVersion failed:", err);
  }
}
