import "mocha";
import { assert } from "chai";
import { getPayPeriodFromWeekEnding, isPayrollWeek2 } from "../src/utilities";

describe("utilities.ts", () => {
  describe("isPayrollWeek2()", () => {
    it("returns true when argument is a valid week 2 of a pay period", () => {
      let weekEnding = new Date("2021-01-09T23:59:59.999-05:00");
      assert(isPayrollWeek2(weekEnding) === true);
      weekEnding = new Date("2021-03-06T23:59:59.999-05:00");
      assert(isPayrollWeek2(weekEnding) === true);
      weekEnding = new Date("2021-03-20T23:59:59.999-04:00");
      assert(isPayrollWeek2(weekEnding) === true);

      // works for pay periods before the epoch too
      weekEnding = new Date("2020-11-14T23:59:59.999-05:00");
      assert(isPayrollWeek2(weekEnding) === true);
    });
    it("returns false when argument is a not a valid week 2 of a pay period", () => {
      let weekEnding = new Date("2021-01-02T23:59:59.999-05:00");
      assert(isPayrollWeek2(weekEnding) === false);
      weekEnding = new Date("2021-03-13T23:59:59.999-05:00");
      assert(isPayrollWeek2(weekEnding) === false);

      // works for pay periods before the epoch too
      weekEnding = new Date("2020-11-14T23:59:59.999-04:00");
      assert(isPayrollWeek2(weekEnding) === false);
      weekEnding = new Date("2020-11-14T23:59:59.999-06:00");
      assert(isPayrollWeek2(weekEnding) === false);
            
      // account for DST change: the date and time are correct but offset is not
      weekEnding = new Date("2021-03-20T23:59:59.999-03:00");
      assert(isPayrollWeek2(weekEnding) === false);
      weekEnding = new Date("2021-03-20T23:59:59.999-05:00");
      assert(isPayrollWeek2(weekEnding) === false);
      weekEnding = new Date("2021-03-20T23:59:59.999-06:00");
      assert(isPayrollWeek2(weekEnding) === false);
    });
  });
  describe("getPayPeriodFromWeekEnding", () => {
    it("returns argument when argument is a valid payroll week 2", () => {
      let weekEnding = new Date("2021-01-09T23:59:59.999-05:00");
      assert(getPayPeriodFromWeekEnding(weekEnding) === weekEnding);
      weekEnding = new Date("2021-03-06T23:59:59.999-05:00");
      assert(getPayPeriodFromWeekEnding(weekEnding) === weekEnding);
      weekEnding = new Date("2021-03-20T23:59:59.999-04:00");
      assert(getPayPeriodFromWeekEnding(weekEnding) === weekEnding);

      // works for pay periods before the epoch too
      weekEnding = new Date("2020-11-14T23:59:59.999-05:00");
      assert(getPayPeriodFromWeekEnding(weekEnding) === weekEnding);
    });
    it("returns weekEnding of corresponding week2 when argument is weekEnding of week1 of pay period", () => {
      let weekEnding = new Date("2021-01-02T23:59:59.999-05:00");
      assert(getPayPeriodFromWeekEnding(weekEnding).getTime() === new Date("2021-01-09T23:59:59.999-05:00").getTime());

      // account for DST time change
      weekEnding = new Date("2021-03-13T23:59:59.999-05:00");
      assert(getPayPeriodFromWeekEnding(weekEnding).getTime() === new Date("2021-03-20T23:59:59.999-04:00").getTime());
    });
    it("throws if the date isn't a valid week ending", () => {
      let weekEnding = new Date("2021-02-01T23:59:59.999-05:00");
      assert.throws(() => { getPayPeriodFromWeekEnding(weekEnding)});
    });
  });
});