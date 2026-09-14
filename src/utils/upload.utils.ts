import { randomUUID } from "crypto";
import path from "path";

import { AppError } from "./AppError.js";
import env from "../config/env.js";
import { ALLOWED_MIME_TYPES, MAX_FILE_SIZE } from "../constants/upload.constants.js";

const SUPABASE_URL = env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const CABINS_BUCKET = env.SUPABASE_BUCKET_CABINS;

function storageHeaders(extra: Record<string, string> = {}) {
  return {
    Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
    ...extra,
  };
}

function buildPublicUrl(filePath: string) {
  return `${SUPABASE_URL}/storage/v1/object/public/${CABINS_BUCKET}/${filePath}`;
}

export function extractFilePath(publicUrl: string) {
  const marker = `/object/public/${CABINS_BUCKET}/`;
  const index = publicUrl.indexOf(marker);
  return publicUrl.substring(index + marker.length);
}

async function uploadSingleImage(file: Express.Multer.File) {
  if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    throw new AppError(`فرمت ${file.mimetype} پشتیبانی نمی‌شود.`, 400);
  }

  const ext = path.extname(file.originalname) || ".jpg";
  const filePath = `cabins/${randomUUID()}${ext}`;

  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${CABINS_BUCKET}/${filePath}`, {
    method: "POST",
    headers: storageHeaders({
      "Content-Type": file.mimetype,
      "Cache-Control": "31536000",
      "x-upsert": "false",
    }),
    body: new Uint8Array(file.buffer),
  });

  if (!res.ok) {
    const errorBody = await res.text().catch(() => "");
    console.error(`Supabase upload failed (${res.status}):`, errorBody);
    throw new AppError("آپلود تصویر ناموفق بود.", 500);
  }

  return buildPublicUrl(filePath);
}

export async function removeUploadedImages(paths: string[] = []) {
  if (paths.length === 0) return;

  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${CABINS_BUCKET}`, {
    method: "DELETE",
    headers: storageHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(paths),
  });

  if (!res.ok) {
    console.error("Supabase image removal failed:", await res.text().catch(() => ""));
  }
}

export async function uploadCabinImages(files: Express.Multer.File[] = []) {
  if (!files || files.length === 0) return [];

  const uploadedPaths: string[] = [];
  const urls: string[] = [];

  for (const file of files) {
    if (file.size > MAX_FILE_SIZE) {
      await removeUploadedImages(uploadedPaths);
      throw new AppError("حجم هر تصویر نباید بیشتر از ۵ مگابایت باشد.", 400);
    }

    try {
      const url = await uploadSingleImage(file);
      urls.push(url);
      uploadedPaths.push(extractFilePath(url));
    } catch (error) {
      await removeUploadedImages(uploadedPaths);
      throw error;
    }
  }

  return urls;
}
