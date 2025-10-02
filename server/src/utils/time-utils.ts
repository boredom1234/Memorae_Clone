import { DateTime } from "luxon";

// Convert an ISO string (with timezone) to canonical UTC ISO string
export function toUTC(iso: string): string {
  const dt = DateTime.fromISO(iso, { setZone: true });
  if (!dt.isValid) {
    throw new Error(`Invalid datetime: ${iso}`);
  }
  return dt.toUTC().toISO()!;
}

// Build a DateTime in user's timezone from JS Date wall-clock components, then return UTC ISO
export function wallClockToUTCFromZone(date: Date, zone: string): string {
  const dt = DateTime.fromObject(
    {
      year: date.getFullYear(),
      month: date.getMonth() + 1,
      day: date.getDate(),
      hour: date.getHours(),
      minute: date.getMinutes(),
      second: date.getSeconds(),
      millisecond: date.getMilliseconds(),
    },
    { zone },
  );
  if (!dt.isValid) {
    throw new Error(`Invalid wall-clock/timezone combination`);
  }
  return dt.toUTC().toISO()!;
}

// Format an ISO date (UTC or with TZ) in a user's timezone
export function formatInZone(iso: string, zone: string, fmt: string = DateTime.DATETIME_MED_WITH_SECONDS): string {
  const dt = DateTime.fromISO(iso, { setZone: true }).setZone(zone);
  if (!dt.isValid) return iso;
  return dt.toFormat(typeof fmt === "string" ? fmt : (fmt as any));
}
