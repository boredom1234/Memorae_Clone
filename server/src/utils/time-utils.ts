import { DateTime } from "luxon";
export function toUTC(iso: string): string {
  const dt = DateTime.fromISO(iso, { setZone: true });
  if (!dt.isValid) {
    throw new Error(`Invalid datetime: ${iso}`);
  }
  return dt.toUTC().toISO()!;
}
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
export function formatInZone(iso: string, zone: string, fmt?: any): string {
  const dt = DateTime.fromISO(iso, { setZone: true }).setZone(zone);
  if (!dt.isValid) return iso;
  try {
    if (!fmt) {
      return dt.toLocaleString(DateTime.DATETIME_MED_WITH_SECONDS);
    }
    if (typeof fmt === "string") {
      return dt.toFormat(fmt);
    }
    return dt.toLocaleString(fmt);
  } catch {
    return dt.toLocaleString(DateTime.DATETIME_MED_WITH_SECONDS);
  }
}
export function nowInZone(zone: string): DateTime {
  return DateTime.now().setZone(zone);
}
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
export function isWithinQuietHours(
  zone: string,
  quietHoursStart: string,
  quietHoursEnd: string,
  quietHoursDays?: string[],
): boolean {
  try {
    const localNow = DateTime.now().setZone(zone);
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
    if (startTime <= endTime) {
      return localNow >= startTime && localNow <= endTime;
    } else {
      return localNow >= startTime || localNow <= endTime;
    }
  } catch (error) {
    return false;
  }
}
export function ensureFutureInZone(dateISO: string, zone: string): string {
  const parsed = DateTime.fromISO(dateISO, { setZone: true });
  const now = DateTime.now().setZone(zone);
  if (!parsed.isValid) {
    throw new Error(`Invalid date: ${dateISO}`);
  }
  const parsedInZone = parsed.setZone(zone);
  if (parsedInZone > now) {
    return dateISO;
  }
  const tomorrow = now.plus({ days: 1 }).set({
    hour: parsedInZone.hour,
    minute: parsedInZone.minute,
    second: parsedInZone.second,
    millisecond: 0,
  });
  return tomorrow.toUTC().toISO()!;
}
