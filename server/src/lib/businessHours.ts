// Business-hours aware due-date calculation for SLA clocks.
//
// Business hours: Monday-Friday, 09:00-18:00, in the organization timezone
// (ORG_TIMEZONE env var). Outside those hours (nights, weekends) does not
// count toward SLA targets when a policy has businessHoursOnly = true.
//
// Implementation note: rather than pull in a heavy timezone library, we
// approximate the org timezone as a fixed UTC offset (adequate for a demo
// where the org timezone does not observe DST). The offset is derived once
// from ORG_TIMEZONE using Intl, and documented in docs/business-rules-and-sla.md.

const BUSINESS_START_HOUR = 9;
const BUSINESS_END_HOUR = 18;

function getOrgOffsetMinutes(): number {
  const tz = process.env.ORG_TIMEZONE || "Asia/Kolkata";
  try {
    const now = new Date();
    const dtf = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const parts = dtf.formatToParts(now);
    const hour = parseInt(parts.find((p) => p.type === "hour")?.value || "0", 10);
    const minute = parseInt(parts.find((p) => p.type === "minute")?.value || "0", 10);
    const utcHour = now.getUTCHours();
    const utcMinute = now.getUTCMinutes();
    let diffMin = (hour * 60 + minute) - (utcHour * 60 + utcMinute);
    // normalize to [-720, 720]
    if (diffMin > 720) diffMin -= 1440;
    if (diffMin < -720) diffMin += 1440;
    return diffMin;
  } catch {
    return 330; // default to IST (+5:30) if Intl/timezone resolution fails
  }
}

const ORG_OFFSET_MIN = getOrgOffsetMinutes();

function toOrgLocal(d: Date): Date {
  return new Date(d.getTime() + ORG_OFFSET_MIN * 60000);
}
function fromOrgLocal(d: Date): Date {
  return new Date(d.getTime() - ORG_OFFSET_MIN * 60000);
}

function isWeekend(localDate: Date): boolean {
  const day = localDate.getUTCDay();
  return day === 0 || day === 6;
}

/**
 * Adds `minutes` of business time (Mon-Fri, 09:00-18:00 org-local) to `start`.
 * `start` and the returned Date are real UTC instants.
 */
export function addBusinessMinutes(start: Date, minutes: number): Date {
  let remaining = minutes;
  let cursor = toOrgLocal(start);

  // If starting outside business hours, snap forward to the next window start.
  cursor = snapToBusinessWindow(cursor);

  while (remaining > 0) {
    const dayStart = setHourMinute(cursor, BUSINESS_START_HOUR, 0);
    const dayEnd = setHourMinute(cursor, BUSINESS_END_HOUR, 0);
    const minutesLeftToday = Math.max(0, (dayEnd.getTime() - cursor.getTime()) / 60000);

    if (remaining <= minutesLeftToday) {
      cursor = new Date(cursor.getTime() + remaining * 60000);
      remaining = 0;
    } else {
      remaining -= minutesLeftToday;
      // jump to next business day start
      cursor = nextBusinessDayStart(dayEnd);
    }
    void dayStart;
  }
  return fromOrgLocal(cursor);
}

/** Adds `minutes` of 24x7 wall-clock time (used when businessHoursOnly = false). */
export function addCalendarMinutes(start: Date, minutes: number): Date {
  return new Date(start.getTime() + minutes * 60000);
}

function setHourMinute(d: Date, hour: number, minute: number): Date {
  const copy = new Date(d);
  copy.setUTCHours(hour, minute, 0, 0);
  return copy;
}

function snapToBusinessWindow(localDate: Date): Date {
  let d = new Date(localDate);
  if (isWeekend(d)) {
    return nextBusinessDayStart(d);
  }
  const start = setHourMinute(d, BUSINESS_START_HOUR, 0);
  const end = setHourMinute(d, BUSINESS_END_HOUR, 0);
  if (d.getTime() < start.getTime()) return start;
  if (d.getTime() >= end.getTime()) return nextBusinessDayStart(d);
  return d;
}

function nextBusinessDayStart(d: Date): Date {
  let next = new Date(d);
  next.setUTCDate(next.getUTCDate() + 1);
  next = setHourMinute(next, BUSINESS_START_HOUR, 0);
  while (isWeekend(next)) {
    next.setUTCDate(next.getUTCDate() + 1);
  }
  return next;
}

export const __internal = { ORG_OFFSET_MIN };
