SELECT tbtePayrollId,
  weekEnding,
  surname,
  givenName,
  manager,
  IFNULL(meals,0) meals,
  IFNULL(daysOffRotation, 0) AS "days off rotation",
  IFNULL(hoursWorked, 0) AS "hours worked",
  salaryHoursOver44,
  adjustedHoursWorked,
  totalOvertimeHours AS "total overtime hours",
  CASE
    WHEN salary = FALSE THEN CASE
      WHEN overtimeHoursToBank > 0 THEN totalOvertimeHours - overtimeHoursToBank
      ELSE totalOvertimeHours
    END
    ELSE 0
  END AS overtimeHoursToPay,
  Bereavement,
  Stat AS "Stat Holiday",
  PPTO,
  Sick,
  Vacation,
  IFNULL(overtimeHoursToBank, 0) AS "overtime hours to bank",
  IFNULL(overtimePayoutRequested, 0) AS "Overtime Payout Requested",
  "UNKNOWN" AS hasAmendmentsForWeeksEnding,
  salary
FROM (
    SELECT *,
      CASE
        WHEN salary = TRUE
        AND hoursWorked > 44 THEN hoursWorked - 44
        ELSE 0
      END AS salaryHoursOver44,
      CASE
        WHEN salary = TRUE THEN CASE
          WHEN hoursWorked + IFNULL(Stat,0) + IFNULL(Bereavement,0) > 40 THEN 40 - IFNULL(Stat,0) - IFNULL(Bereavement,0)
          ELSE hoursWorked
        END
        ELSE CASE
          WHEN hoursWorked > 44 THEN 44
          ELSE hoursWorked
        END
      END AS adjustedHoursWorked,
      CASE
        WHEN salary = FALSE
        AND hoursWorked > 44 THEN hoursWorked - 44
        ELSE 0
      END AS totalOvertimeHours
    FROM (
        SELECT TimeSheets.tbtePayrollId AS tbtePayrollId,
          TimeSheets.weekEnding AS weekEnding,
          TimeSheets.surname AS surname,
          TimeSheets.givenName AS givenName,
          TimeSheets.managerName AS manager,
          SUM(TimeEntries.mealsHours) AS meals,
          SUM(
            CASE
              WHEN timetype = "OR" THEN 1
            END
          ) AS daysOffRotation,
          SUM(
            CASE
              WHEN timetype IN ("R", "RT") THEN IFNULL(hours, 0) + IFNULL(jobHours, 0)
            END
          ) AS hoursWorked,
          SUM(
            CASE
              WHEN timetype = "OB" THEN hours
            END
          ) AS Bereavement,
          SUM(
            CASE
              WHEN timetype = "OH" THEN hours
            END
          ) AS Stat,
          SUM(
            CASE
              WHEN timetype = "OP" THEN hours
            END
          ) AS PPTO,
          SUM(
            CASE
              WHEN timetype = "OS" THEN hours
            END
          ) AS Sick,
          SUM(
            CASE
              WHEN timetype = "OV" THEN hours
            END
          ) AS Vacation,
          SUM(
            CASE
              WHEN timetype = "RB" THEN hours
            END
          ) AS overtimeHoursToBank,
          SUM(TimeEntries.payoutRequestAmount) AS overtimePayoutRequested,
          "UNKNOWN" AS hasAmendmentsForWeeksEnding,
          TimeSheets.salary AS salary
        FROM TimeSheets
          RIGHT OUTER JOIN TimeEntries ON TimeSheets.id = TimeEntries.tsid
        WHERE TimeSheets.weekEnding = ?
        GROUP BY TimeSheets.uid
      ) AS x
  ) AS y;