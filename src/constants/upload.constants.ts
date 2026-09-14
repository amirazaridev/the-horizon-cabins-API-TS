/** فرمت‌های تصویر مجاز — تک منبع حقیقت برای middleware و util */
export const ALLOWED_MIME_TYPES = /** @type {const} */ ([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
]);

/** حداکثر حجم هر تصویر: ۵ مگابایت */
export const MAX_FILE_SIZE = 5 * 1024 * 1024;

/** حداکثر تعداد عکس — هماهنگ با maxImages فرم */
export const MAX_IMAGES = 10;

/** نام فیلد multipart برای فایل‌های جدید — باید با فرمت یکی باشد */
export const IMAGE_FIELD_NAME = "newImages";