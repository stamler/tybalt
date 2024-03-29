/* This SQL is designed to exactly replicate the CSV report generated by
 generatePayrollCSV(). Testing has been done using a jupyter notebook in the
 frontend/src/notebooks directory to ensure that the results are identical. The
 only difference is as follows:
 
 For pay periods when a payroll report entry for a staff member includes any
 amendments, the SQL version of the report names the amender as the manager
 rather than the manager who approved the timesheets. The rationale for this is
 that the amender had reason to modify the original data.
 
This is a different behaviour than the pre-SQL reports in which the approving
manager was always listed as the manager regardless of the presence of
amendments.
 
I will be removing the non-SQL reports in version 0.11.0 so the SQL behaviour
will be the only behaviour in Tybalt payroll reports.
 */

/* The outside query does math for some additional columns and sorts and aliases
 them for presentation to the user */
SELECT payrollId,
  DATE_FORMAT(weekEnding,"%Y %b %d") weekEnding,
  surname,
  givenName,
  CONCAT(givenName, " ", surname) name,
  manager,
  IFNULL(mealsSum,0) meals,
  IFNULL(daysOffRotation, 0) "days off rotation",
  IFNULL(hoursWorked, 0) "hours worked",
  salaryHoursOver44,
  IFNULL(adjustedHoursWorked, 0) adjustedHoursWorked,
  totalOvertimeHours "total overtime hours",
  CASE
    WHEN salary = FALSE THEN CASE
      WHEN overtimeHoursToBank > 0 THEN totalOvertimeHours - overtimeHoursToBank
      ELSE totalOvertimeHours
    END
    ELSE 0
  END "overtime hours to pay",
  Bereavement,
  Stat "Stat Holiday",
  PPTO,
  Sick,
  Vacation,
  IFNULL(overtimeHoursToBank, 0) "overtime hours to bank",
  IFNULL(overtimePayoutRequested, 0) "Overtime Payout Requested",
  IFNULL(hasAmendmentsForWeeksEnding, "") hasAmendmentsForWeeksEnding,
  salary
FROM (
    /* This mid-level subquery does math that is simpler at this level because
     it can use aliases created in the inside query rather than recreating the
     math again */
    SELECT *,
      CASE
        WHEN salary = TRUE
        AND hoursWorked > 44 THEN hoursWorked - 44
        ELSE 0
      END AS salaryHoursOver44,
      CASE
        WHEN salary = TRUE THEN CASE
          WHEN hoursWorked + IFNULL(Stat,0) + IFNULL(Bereavement,0) > workWeekHours THEN workWeekHours - IFNULL(Stat,0) - IFNULL(Bereavement,0)
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
        /* The inside query, with an ALIAS of BASE, is grouped by primaryUid,
         which is an alias of uid created because the immediate subquery has two
         columns called uid. Each SUM column wraps a CASE statement which pivots
         the single timetype column into a column for each of the corresonding
         timetype values so that we can individually SUM them */
        SELECT *,
          SUM(meals) mealsSum,
          SUM(
            CASE
              WHEN timetype = "OR" THEN 1
            END
          ) daysOffRotation,
          SUM(
            CASE
              WHEN timetype IN ("R", "RT") THEN IFNULL(hours, 0) + IFNULL(jobHours, 0)
            END
          ) hoursWorked,
          SUM(
            CASE
              WHEN timetype = "OB" THEN hours
            END
          ) Bereavement,
          SUM(
            CASE
              WHEN timetype = "OH" THEN hours
            END
          ) Stat,
          SUM(
            CASE
              WHEN timetype = "OP" THEN hours
            END
          ) PPTO,
          SUM(
            CASE
              WHEN timetype = "OS" THEN hours
            END
          ) Sick,
          SUM(
            CASE
              WHEN timetype = "OV" THEN hours
            END
          ) Vacation,
          SUM(
            CASE
              WHEN timetype = "RB" THEN hours
            END
          ) overtimeHoursToBank,
          SUM(payoutRequestAmount) overtimePayoutRequested
        FROM (
            /* This subquery is made of two joined subqueries. The LEFT is
             specified columns from all TimeAmendments rows with the given
             weekEnding. The RIGHT is a JSON array of all of the weekEndings for
             each UID where the committedWeekEnding is equal to the provided
             weekEnding value. The RIGHT is created with a subquery on
             TimeAmendments and is created because JSON_ARRAYAGG() has no
             ability to have DISTINCT inside it */
            SELECT *
            FROM (
                SELECT payrollId,
                  workWeekHours,
                  committedWeekEnding weekEnding,
                  surname,
                  givenName,
                  commitName manager,
                  mealsHours meals,
                  payoutRequestAmount,
                  committedWeekEnding,
                  salary,
                  uid primaryUid,
                  timetype,
                  hours,
                  jobHours
                FROM TimeAmendments
                WHERE committedWeekEnding = ?
              ) X
              LEFT OUTER JOIN (
                SELECT uid,
                  JSON_ARRAYAGG(weekEnding) hasAmendmentsForWeeksEnding
                FROM (
                    SELECT DISTINCT uid,
                      weekEnding
                    FROM TimeAmendments
                    WHERE committedWeekEnding = ?
                  ) Y
                GROUP BY uid
              ) Y ON X.primaryUid = Y.uid
              /* By default, duplicate rows are removed in MySQL (UNION
               DISTINCT). Here we use UNION ALL so that the totals include every
               TimeEntry and Amendment entered */
            UNION ALL
            /* Regular TimeEntries joined with the corresponding TimeSheets with
             columns matching the previous query. Uses the weekEnding value to
             get only the TimeEntries from a particular week. NULL columns are
             created for committedWeekEnding, the second uid column, and
             hasAmendmentsForWeekEnding since these columns only appear in the
             first subquery of the UNION */
            SELECT payrollId,
              workWeekHours,
              weekEnding,
              surname,
              givenName,
              managerName,
              mealsHours,
              payoutRequestAmount,
              NULL,
              salary,
              TimeEntries.uid,
              timetype,
              hours,
              jobHours,
              NULL,
              NULL
            FROM TimeEntries
              LEFT OUTER JOIN TimeSheets ON TimeEntries.tsid = TimeSheets.id
            WHERE weekEnding = ?
          ) BASE
        GROUP BY primaryUid
      ) MIDDLE
  ) FINAL ORDER BY LENGTH(payrollId), payrollId;