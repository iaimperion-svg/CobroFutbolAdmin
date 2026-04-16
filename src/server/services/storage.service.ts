import { mkdir, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { env } from "@/server/config/env";
import {
  resolveTelegramFileDownloadUrl,
  resolveTelegramFileDownloadUrlWithToken
} from "@/server/services/telegram.service";

type MediaReference = {
  fileUrl?: string | null;
  originalFileName?: string | null;
  mimeType?: string | null;
  inlineBase64?: string | null;
  telegramBotToken?: string | null;
};

async function ensureUploadDir() {
  await mkdir(env.UPLOAD_DIR, { recursive: true });
}

function detectExtension(mimeType?: string | null, originalFileName?: string | null) {
  if (originalFileName?.includes(".")) {
    return `.${originalFileName.split(".").pop()}`;
  }

  if (mimeType?.includes("pdf")) {
    return ".pdf";
  }

  if (mimeType?.includes("png")) {
    return ".png";
  }

  return ".jpg";
}

export async function persistReceiptMedia(receiptId: string, media: MediaReference) {
  await ensureUploadDir();

  const extension = detectExtension(media.mimeType, media.originalFileName);
  const filePath = join(env.UPLOAD_DIR, `${receiptId}${extension}`);

  if (media.inlineBase64) {
    await writeFile(filePath, Buffer.from(media.inlineBase64, "base64"));
    return filePath;
  }

  if (!media.fileUrl) {
    return null;
  }

  const remoteUrl = await resolveSpecialMediaUrl(media.fileUrl, media.telegramBotToken);
  const response = await fetch(remoteUrl);

  if (!response.ok) {
    throw new Error(`No se pudo descargar el archivo remoto: ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  await writeFile(filePath, Buffer.from(arrayBuffer));

  return filePath;
}

async function resolveSpecialMediaUrl(fileUrl: string, telegramBotToken?: string | null) {
  if (fileUrl.startsWith("telegram://")) {
    const fileId = basename(fileUrl);
    return telegramBotToken
      ? resolveTelegramFileDownloadUrlWithToken(fileId, telegramBotToken)
      : resolveTelegramFileDownloadUrl(fileId);
  }

  return fileUrl;
}
