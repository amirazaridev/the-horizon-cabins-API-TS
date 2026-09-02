import { z } from "zod";

const signupBodySchema = z.object({
  fullName: z
    .string()
    .min(3, { message: "Full name must be between 3 and 100 characters" })
    .max(100, { message: "Full name must be between 3 and 100 characters" })
    .trim(),

  name: z
    .string()
    .min(4, { message: "Name must be at least 4 characters" })
    .max(40, { message: "Name cannot exceed 40 characters" })
    .optional(),

  email: z.string().email({ message: "Must be a valid email address" }).toLowerCase().trim(),

  password: z
    .string()
    .min(6, { message: "Password must be at least 6 characters" })
    .max(100, { message: "Password cannot exceed 100 characters" }),
});
// نکته امنیتی: role عمداً اینجا نیست تا کاربر نتونه role خودش رو ست کنه (Mass Assignment)

const loginBodySchema = z.object({
  email: z.string().email({ message: "Must be a valid email address" }).toLowerCase().trim(),
  password: z.string().min(1, { message: "Password is required" }),
});

export const signupSchema = {
  body: signupBodySchema,
};

export const loginSchema = {
  body: loginBodySchema,
};
