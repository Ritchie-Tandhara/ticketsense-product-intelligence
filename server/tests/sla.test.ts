import { describe, it, expect } from "vitest";
import { addBusinessMinutes, addCalendarMinutes } from "../src/lib/businessHours";

describe("Business-hours SLA due date calculation", () => {
  it("adds calendar minutes with no business-hours constraint", () => {
    const start = new Date("2026-01-05T10:00:00.000Z"); // a Monday
    const due = addCalendarMinutes(start, 120);
    expect(due.getTime() - start.getTime()).toBe(120 * 60000);
  });

  it("rolls over to the next business day when a deadline would fall after hours", () => {
    // Org timezone defaults to Asia/Kolkata (UTC+5:30) in test env.
    // 2026-01-05 is a Monday. 17:00 local = 11:30 UTC.
    const start = new Date("2026-01-05T11:30:00.000Z"); // 17:00 IST Monday
    const due = addBusinessMinutes(start, 120); // 2 hours of business time -> past 18:00 local
    // Should roll into Tuesday morning (1 hour used Monday 17:00-18:00, then
    // 1 more hour from Tuesday's 09:00 business-day start = 10:00 IST local).
    expect(due.getTime()).toBeGreaterThan(start.getTime());
    expect(due.getUTCDate()).toBe(6); // Tuesday
    expect(due.getUTCHours()).toBe(4);
    expect(due.getUTCMinutes()).toBe(30);
  });

  it("skips weekends when computing business-hours due dates", () => {
    // 2026-01-09 is a Friday. 17:00 IST Friday = 11:30 UTC.
    const start = new Date("2026-01-09T11:30:00.000Z");
    const due = addBusinessMinutes(start, 120); // should roll to Monday, not Saturday
    const day = due.getUTCDay();
    expect(day).not.toBe(0); // not Sunday
    expect(day).not.toBe(6); // not Saturday
  });
});
