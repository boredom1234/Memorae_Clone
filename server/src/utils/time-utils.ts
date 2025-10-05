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
export function formatInZone(
  iso: string,
  zone: string,
  fmt: string = DateTime.DATETIME_MED_WITH_SECONDS,
): string {
  const dt = DateTime.fromISO(iso, { setZone: true }).setZone(zone);
  if (!dt.isValid) return iso;
  return dt.toFormat(typeof fmt === "string" ? fmt : (fmt as any));
}

// Get current time in a specific timezone
export function nowInZone(zone: string): DateTime {
  return DateTime.now().setZone(zone);
}

// Create a date in the future relative to user's timezone
export function createFutureDateInZone(
  zone: string,
  daysOffset: number,
  hours: number,
  minutes: number = 0,
): string {
  const dt = DateTime.now()
    .setZone(zone)
    .plus({ days: daysOffset })
    .set({ hour: hours, minute: minutes, second: 0, millisecond: 0 });
  return dt.toUTC().toISO()!;
}

// Check if a time is within quiet hours in user's timezone
export function isWithinQuietHours(
  zone: string,
  quietHoursStart: string, // "HH:MM"
  quietHoursEnd: string, // "HH:MM"
  quietHoursDays?: string[], // ["monday", "tuesday", ...]
): boolean {
  try {
    const localNow = DateTime.now().setZone(zone);
    
    // Check if today is in the quiet hours days
    if (quietHoursDays && quietHoursDays.length > 0) {
      const dayNames = [
        "sunday",
        "monday",
        "tuesday",
        "wednesday",
        "thursday",
        "friday",
        "saturday",
      ];
      const today = dayNames[localNow.weekday % 7];
      if (!quietHoursDays.includes(today)) {
        return false;
      }
    }

    // Parse start and end times
    const [startHour, startMin] = quietHoursStart.split(":").map(Number);
    const [endHour, endMin] = quietHoursEnd.split(":").map(Number);

    const startTime = localNow.set({
      hour: startHour,
      minute: startMin,
      second: 0,
      millisecond: 0,
    });
    const endTime = localNow.set({
      hour: endHour,
      minute: endMin,
      second: 0,
      millisecond: 0,
    });

    // Handle cases where quiet hours span midnight
    if (startTime <= endTime) {
      return localNow >= startTime && localNow <= endTime;
    } else {
      return localNow >= startTime || localNow <= endTime;
    }
  } catch (error) {
    return false;
  }
}

// Ensure a date is in the future relative to user's timezone
export function ensureFutureInZone(dateISO: string, zone: string): string {
  const parsed = DateTime.fromISO(dateISO, { setZone: true });
  const now = DateTime.now().setZone(zone);

  if (!parsed.isValid) {
    throw new Error(`Invalid date: ${dateISO}`);
  }

  const parsedInZone = parsed.setZone(zone);

  if (parsedInZone > now) {
    return dateISO; // Already future
  }

  // If the time has passed today, assume user meant tomorrow
  const tomorrow = now.plus({ days: 1 }).set({
    hour: parsedInZone.hour,
    minute: parsedInZone.minute,
    second: parsedInZone.second,
    millisecond: 0,
  });

  return tomorrow.toUTC().toISO()!;
}
