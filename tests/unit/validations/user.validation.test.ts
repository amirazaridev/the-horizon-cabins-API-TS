import { describe, it, expect } from "vitest";
import {
  deleteUserSchema,
  listUsersQueryValidation,
  updateProfileSchema,
  updateUserRoleSchema,
  updateUserStatusSchema,
} from "../../../src/validations/user.validation.js";

/** استخراج پیام‌های خطا از نتیجه‌ی safeParse برای assert راحت‌تر. */
function issues(result: { success: boolean; error?: { issues: unknown[] } }) {
  return result.success
    ? []
    : (result.error!.issues as Array<{ path: unknown[]; message: string }>);
}

const validBody = {
  fullName: "علی رضایی",
  phoneNumber: "09123456789",
  nationalId: "1234567890",
  dateOfBirth: "1991-08-03",
};

describe("user.validation — updateProfileSchema", () => {
  it("should accept a fully valid body and transform dateOfBirth to a UTC midnight Date", () => {
    const result = updateProfileSchema.body.safeParse(validBody);

    expect(result.success).toBe(true);
    expect(result.data!.fullName).toBe("علی رضایی");
    expect(result.data!.phoneNumber).toBe("09123456789");
    expect(result.data!.nationalId).toBe("1234567890");
    expect(result.data!.dateOfBirth?.toISOString()).toBe("1991-08-03T00:00:00.000Z");
  });

  it("should treat absent optional fields as undefined so a partial PATCH leaves them untouched", () => {
    const result = updateProfileSchema.body.safeParse({ fullName: "علی رضایی" });

    expect(result.success).toBe(true);
    expect(result.data!.phoneNumber).toBeUndefined();
    expect(result.data!.nationalId).toBeUndefined();
    expect(result.data!.dateOfBirth).toBeUndefined();
    expect(result.data!.gender).toBeUndefined();
  });

  it("should normalize empty strings and null to null (clear the value)", () => {
    const result = updateProfileSchema.body.safeParse({
      fullName: "علی رضایی",
      phoneNumber: "",
      nationalId: null,
      dateOfBirth: "",
      gender: null,
    });

    expect(result.success).toBe(true);
    expect(result.data!.phoneNumber).toBeNull();
    expect(result.data!.nationalId).toBeNull();
    expect(result.data!.dateOfBirth).toBeNull();
    expect(result.data!.gender).toBeNull();
  });

  it("should reject a full name shorter than 3 characters", () => {
    const result = updateProfileSchema.body.safeParse({ fullName: "ab" });
    expect(result.success).toBe(false);
    expect(issues(result).some((i) => i.path[0] === "fullName")).toBe(true);
  });

  it("should reject an invalid phone number", () => {
    const result = updateProfileSchema.body.safeParse({
      fullName: "علی رضایی",
      phoneNumber: "0812345678",
    });
    expect(result.success).toBe(false);
    expect(issues(result).some((i) => i.path[0] === "phoneNumber")).toBe(true);
  });

  it("should reject a national ID that is not exactly 10 digits", () => {
    const result = updateProfileSchema.body.safeParse({
      fullName: "علی رضایی",
      nationalId: "12345",
    });
    expect(result.success).toBe(false);
    expect(issues(result).some((i) => i.path[0] === "nationalId")).toBe(true);
  });

  it("should reject a non-existent calendar date (1991-02-30)", () => {
    const result = updateProfileSchema.body.safeParse({
      fullName: "علی رضایی",
      dateOfBirth: "1991-02-30",
    });
    expect(result.success).toBe(false);
    expect(issues(result).some((i) => i.path[0] === "dateOfBirth")).toBe(true);
  });

  it("should reject a malformed date of birth", () => {
    const result = updateProfileSchema.body.safeParse({
      fullName: "علی رضایی",
      dateOfBirth: "03/08/1991",
    });
    expect(result.success).toBe(false);
  });

  it("should reject an unknown gender value", () => {
    const result = updateProfileSchema.body.safeParse({
      fullName: "علی رضایی",
      gender: "other",
    });
    expect(result.success).toBe(false);
    expect(issues(result).some((i) => i.path[0] === "gender")).toBe(true);
  });

  it("should accept a valid gender value", () => {
    const result = updateProfileSchema.body.safeParse({
      fullName: "علی رضایی",
      gender: "female",
    });
    expect(result.success).toBe(true);
    expect(result.data!.gender).toBe("female");
  });

  it("should ignore unknown fields such as email/role (no mass assignment)", () => {
    const result = updateProfileSchema.body.safeParse({
      fullName: "علی رضایی",
      email: "hacker@evil.com",
      role: "admin",
    });

    expect(result.success).toBe(true);
    expect(result.data).not.toHaveProperty("email");
    expect(result.data).not.toHaveProperty("role");
  });
});

describe("user.validation — admin user management", () => {
  describe("listUsersQueryValidation", () => {
    const parse = (query: Record<string, unknown>) =>
      listUsersQueryValidation.query.safeParse(query);

    it("should apply pagination defaults and leave filters empty", () => {
      const result = parse({});
      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data).toMatchObject({ page: 1, limit: 10 });
      expect(result.data.q).toBeUndefined();
      expect(result.data.active).toBeUndefined();
    });

    it("should coerce numeric strings for page/limit", () => {
      const result = parse({ page: "3", limit: "25" });
      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data.page).toBe(3);
      expect(result.data.limit).toBe(25);
    });

    it("should parse the boolean `active` from a query string", () => {
      const yes = parse({ active: "true" });
      expect(yes.success && yes.data.active).toBe(true);

      const no = parse({ active: "0" });
      expect(no.success && no.data.active).toBe(false);
    });

    it("should reject a `q` shorter than 2 characters", () => {
      expect(parse({ q: "a" }).success).toBe(false);
    });

    it("should reject an unknown `active` value", () => {
      expect(parse({ active: "maybe" }).success).toBe(false);
    });

    it("should reject a limit above the maximum", () => {
      expect(parse({ limit: "500" }).success).toBe(false);
    });

    it("should parse a CSV `roles` list", () => {
      const result = parse({ roles: "admin,owner" });
      expect(result.success).toBe(true);
      expect(result.success && result.data.roles).toEqual(["admin", "owner"]);
    });

    it("should reject an unknown role inside `roles`", () => {
      expect(parse({ roles: "admin,superuser" }).success).toBe(false);
    });
  });

  describe("deleteUserSchema", () => {
    it("should coerce a numeric id param", () => {
      const result = deleteUserSchema.params.safeParse({ id: "9" });
      expect(result.success && result.data.id).toBe(9);
    });

    it("should reject a non-numeric id param", () => {
      expect(deleteUserSchema.params.safeParse({ id: "abc" }).success).toBe(false);
    });
  });

  describe("updateUserStatusSchema", () => {
    it("should accept a boolean body and a numeric id param", () => {
      expect(updateUserStatusSchema.body.safeParse({ active: false }).success).toBe(true);

      const params = updateUserStatusSchema.params.safeParse({ id: "12" });
      expect(params.success && params.data.id).toBe(12);
    });

    it("should reject a non-boolean body", () => {
      expect(updateUserStatusSchema.body.safeParse({ active: "yes" }).success).toBe(false);
    });
  });

  describe("updateUserRoleSchema", () => {
    it("should accept each known role", () => {
      for (const role of ["guest", "admin", "owner"]) {
        expect(updateUserRoleSchema.body.safeParse({ role }).success).toBe(true);
      }
    });

    it("should reject an unknown role", () => {
      expect(updateUserRoleSchema.body.safeParse({ role: "superadmin" }).success).toBe(false);
    });
  });
});
