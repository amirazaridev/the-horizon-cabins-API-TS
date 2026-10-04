import { prisma } from "../../src/config/database.js";
import type {
  UserRole,
  BookingStatus,
  CancellationReason,
} from "../../src/generated/prisma/enums.js";

/**
 * factoryها برای ساخت داده‌ی تست.
 *
 * همه‌ی factoryها override می‌پذیرند تا هر تست فقط چیزهایی را که به آن‌ها
 * اهمیت می‌دهد مطرح کند، و مقادیر پیش‌فرض معتبر داشته باشد. هیچ تستی نباید
 * ردیف را «دستی با کپی» بسازد.
 */

let sequence = 0;
/** شمارنده‌ی یکتا برای پرهیز از تکراری‌شدن فیلدهای unique (email، name، slug). */
function nextId(): number {
  sequence += 1;
  return sequence;
}

export const DEFAULT_PASSWORD = "TestPassword123!";

export interface CreateUserOptions {
  role?: UserRole;
  email?: string;
  active?: boolean;
  password?: string;
  /** اگر true باشد، پروفایل Guest هم ساخته می‌شود (پیش‌فرض برای guest). */
  withGuest?: boolean;
  fullName?: string;
}

export interface CreatedUser {
  id: number;
  email: string;
  role: UserRole;
  guestId: number | null;
}

/**
 * ساخت کاربر (و در صورت نیاز پروفایل مهمان).
 * - پیش‌فرض: برای نقش guest، پروفایل Guest هم ساخته می‌شود.
 * - برای admin/owner پیش‌فرض بدون Guest است.
 */
export async function createUser(options: CreateUserOptions = {}): Promise<CreatedUser> {
  const id = nextId();
  const role: UserRole = options.role ?? "guest";
  const email = options.email ?? `user${id}@test.local`;
  const withGuest = options.withGuest ?? role === "guest";

  // از repository استفاده نمی‌کنیم تا password هش‌شدن را از دست ندهیم؛
  // prisma extension در config/database روی create کاربر هش می‌کند.
  const user = await prisma.user.create({
    data: {
      email,
      password: options.password ?? DEFAULT_PASSWORD,
      role,
      active: options.active ?? true,
    },
  });

  let guestId: number | null = null;
  if (withGuest) {
    const guest = await prisma.guest.create({
      data: { userId: user.id, fullName: options.fullName ?? `Guest ${id}` },
    });
    guestId = guest.id;
  }

  return { id: user.id, email: user.email, role: user.role, guestId };
}

export interface CreateCabinOptions {
  name?: string;
  maxCapacity?: number;
  regularPrice?: number;
  discount?: number;
  cityId?: number;
}

export interface CreatedCabin {
  id: number;
  name: string;
  maxCapacity: number;
  regularPrice: number;
  discount: number;
  cityId: number;
}

/** ساخت Region → City → Cabin به‌صورت خودکار (Cabin به city نیاز دارد). */
export async function createCabin(options: CreateCabinOptions = {}): Promise<CreatedCabin> {
  const id = nextId();
  const cityId = options.cityId ?? (await createCity()).id;

  const cabin = await prisma.cabin.create({
    data: {
      name: options.name ?? `Cabin ${id}`,
      maxCapacity: options.maxCapacity ?? 4,
      regularPrice: options.regularPrice ?? 1_000_000,
      discount: options.discount ?? 0,
      description: "Test cabin",
      amenities: ["wifi"],
      bedrooms: 2,
      bathrooms: 1,
      areaSqm: 80,
      images: [],
      latitude: 35.7,
      longitude: 51.4,
      cityId,
    },
  });

  return {
    id: cabin.id,
    name: cabin.name,
    maxCapacity: cabin.maxCapacity,
    regularPrice: cabin.regularPrice,
    discount: cabin.discount,
    cityId: cabin.cityId,
  };
}

export async function createRegion(name?: string) {
  const id = nextId();
  return prisma.region.create({
    data: { name: name ?? `Region ${id}`, slug: `region-${id}` },
  });
}

export async function createCity(regionId?: number) {
  const id = nextId();
  const region = regionId ?? (await createRegion()).id;
  return prisma.city.create({
    data: { name: `City ${id}`, regionId: region },
  });
}

export interface CreateBookingOptions {
  cabinId: number;
  guestId: number;
  startDate?: Date;
  endDate?: Date;
  numNights?: number;
  numGuests?: number;
  status?: BookingStatus;
  paymentDeadline?: Date;
  cabinPrice?: number;
  totalPrice?: number;
  paidAt?: Date | null;
  paymentReference?: string | null;
  cancelledAt?: Date | null;
  cancellationReason?: CancellationReason | null;
  observations?: string | null;
}

/** ساخت مستقیم رزرو در دیتابیس (برای تست‌های repository و route). */
export async function createBooking(options: CreateBookingOptions) {
  const startDate = options.startDate ?? utcDate("2030-06-01");
  const endDate = options.endDate ?? utcDate("2030-06-03");
  const numNights =
    options.numNights ?? Math.round((endDate.getTime() - startDate.getTime()) / 86_400_000);

  return prisma.booking.create({
    data: {
      startDate,
      endDate,
      numNights,
      numGuests: options.numGuests ?? 2,
      cabinPrice: options.cabinPrice ?? 1_000_000,
      totalPrice: options.totalPrice ?? (options.cabinPrice ?? 1_000_000) * numNights,
      status: options.status ?? "pending",
      paymentDeadline: options.paymentDeadline ?? new Date(Date.now() + 30 * 60 * 1000),
      paidAt: options.paidAt ?? null,
      paymentReference: options.paymentReference ?? null,
      cancelledAt: options.cancelledAt ?? null,
      cancellationReason: options.cancellationReason ?? null,
      observations: options.observations ?? null,
      cabinId: options.cabinId,
      guestId: options.guestId,
    },
  });
}

/** ساخت Date به‌صورت نیمه‌شب UTC از رشته‌ی YYYY-MM-DD. */
export function utcDate(ymd: string): Date {
  return new Date(`${ymd}T00:00:00.000Z`);
}
