/* timetypeSummary */
SELECT *,
  (OP + OV) "OP + OV"
FROM (
    SELECT DATE_FORMAT(date, "%X-W%V") week,
      SUM(
        CASE
          WHEN timetype = "OB" THEN hours
          ELSE 0
        END
      ) OB,
      SUM(
        CASE
          WHEN timetype = "OH" THEN hours
          ELSE 0
        END
      ) OH,
      SUM(
        CASE
          WHEN timetype = "OP" THEN hours
          ELSE 0
        END
      ) OP,
      SUM(
        CASE
          WHEN timetype = "OS" THEN hours
          ELSE 0
        END
      ) OS,
      SUM(
        CASE
          WHEN timetype = "OV" THEN hours
          ELSE 0
        END
      ) OV,
      SUM(
        CASE
          WHEN timetype = "R"
          AND jobHours IS NULL THEN hours
          ELSE 0
        END
      ) "R_noJob",
      SUM(
        CASE
          WHEN timetype = "RT"
          AND jobHours IS NULL THEN hours
          ELSE 0
        END
      ) "RT_noJob",
      SUM(
        CASE
          WHEN timetype = "R"
          AND jobHours IS NOT NULL THEN jobHours
          ELSE 0
        END
      ) "R_jobHours",
      SUM(
        CASE
          WHEN timetype = "RT"
          AND jobHours IS NOT NULL THEN jobHours
          ELSE 0
        END
      ) "RT_jobHours"
    FROM TimeEntries
    WHERE date > "2021-06-12"
    GROUP BY DATE_FORMAT(date, "%X-W%V")
  ) BASE;