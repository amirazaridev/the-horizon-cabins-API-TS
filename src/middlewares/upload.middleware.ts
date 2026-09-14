import multer from "multer";

import { AppError } from "../utils/AppError.js";
import {
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE,
  MAX_IMAGES,
  IMAGE_FIELD_NAME,
} from "../constants/upload.constants.js";
import { NextFunction, Response, Request } from "express";

const upload = multer({
  storage: multer.memoryStorage(), // buffer مستقیم به Supabase می‌ره
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: MAX_IMAGES,
  },
  fileFilter: (_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      return cb(new AppError("فقط فایل‌های تصویری (JPEG/PNG/WebP/AVIF) مجاز هستند.", 400));
    }
    cb(null, true);
  },
});

// نام فیلد از منبع واحد حقیقت میاد — دیگه احتمال ناهماهنگی با فرمت صفره
export const uploadCabinImages = (req: Request, res: Response, next: NextFunction) =>
  upload.array(IMAGE_FIELD_NAME, MAX_IMAGES)(req, res, next);
