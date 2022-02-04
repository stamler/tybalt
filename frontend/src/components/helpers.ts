import { utcToZonedTime, zonedTimeToUtc } from "date-fns-tz";
import { addDays, differenceInDays } from "date-fns";

// Given a number (result of getTime() from js Date object), verify that it is
// 23:59:59 in America/Thunder_bay on a saturday and that the saturday is a
// week 2 of a payroll at TBT Engineering. The definition of this is an
// integer multiple of 14 days after Dec 26, 2020 at 23:59:59.999 EST
// NB: THIS FUNCTION ALSO IN BACKEND utilities.ts
export function isPayrollWeek2(weekEnding: Date): boolean {
  const PAYROLL_EPOCH = new Date(Date.UTC(2020, 11, 27, 4, 59, 59, 999));

  // There will not be integer days if epoch and weekEnding are in different
  // time zones (EDT vs EST). Convert them both to the same timezone prior
  // to calculating the difference
  const tbayEpoch = utcToZonedTime(PAYROLL_EPOCH, "America/Thunder_Bay");
  const tbayWeekEnding = utcToZonedTime(weekEnding, "America/Thunder_Bay");
  const difference = differenceInDays(tbayWeekEnding, tbayEpoch);

  return difference % 14 === 0 ? true : false;
}

export function nextSaturday(date: Date): Date {
  let calculatedSaturday;
  const zonedTime = utcToZonedTime(date, "America/Thunder_Bay");
  if (zonedTime.getDay() === 6) {
    calculatedSaturday = zonedTimeToUtc(
      new Date(
        zonedTime.getFullYear(),
        zonedTime.getMonth(),
        zonedTime.getDate(),
        23,
        59,
        59,
        999
      ),
      "America/Thunder_Bay"
    );
  } else {
    const nextsat = new Date(zonedTime.getTime());
    nextsat.setDate(nextsat.getDate() - nextsat.getDay() + 6);
    calculatedSaturday = zonedTimeToUtc(
      new Date(
        nextsat.getFullYear(),
        nextsat.getMonth(),
        nextsat.getDate(),
        23,
        59,
        59,
        999
      ),
      "America/Thunder_Bay"
    );
  }
  return calculatedSaturday;
}

// return the same time 7 days from now in the given time zone
export function thisTimeNextWeekInTimeZone(
  datetime: Date,
  timezone: string
): Date {
  const zone_time = utcToZonedTime(datetime, timezone);
  return zonedTimeToUtc(addDays(zone_time, 7), timezone);
}

// This generator creates an iterable object that yields all pay period ending
// Date objects for the specified year but no later than today.
export function* payPeriodsForYear(year: number): Generator<Date, void, void> {
  const now = new Date();
  const firstSat = nextSaturday(new Date(year, 0, 0, 0, 0));
  let period = isPayrollWeek2(firstSat)
    ? firstSat
    : thisTimeNextWeekInTimeZone(firstSat, "America/Thunder_Bay");
  while (period.getFullYear() <= year && period < now) {
    yield period;
    period = thisTimeNextWeekInTimeZone(
      thisTimeNextWeekInTimeZone(period, "America/Thunder_Bay"),
      "America/Thunder_Bay"
    );
  }
}
