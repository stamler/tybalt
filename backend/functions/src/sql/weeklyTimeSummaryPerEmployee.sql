/* The weekly time summary per employee 
 */
WITH base AS (
  SELECT CONCAT(surname, ', ', givenName) Employee,
    GROUP_CONCAT(DISTINCT division) divisions,
    IFNULL(SUM(jobHours), 0) c,
    IFNULL(SUM(hours), 0) nc,
    SUM(IFNULL(CASE WHEN TE.timeType IN ("R", "RT") THEN TE.hours END, 0)) nc_worked,
    SUM(IFNULL(CASE WHEN TE.timeType IN ("OP", "OV", "OH", "OB", "OS") THEN TE.hours END, 0)) nc_unworked
  FROM TimeSheets TS
    LEFT JOIN TimeEntries TE ON TS.id = TE.tsid
  WHERE TE.timeType != 'RB'
    AND TS.weekEnding = ?
  GROUP BY TS.uid
  ORDER BY TS.surname
)
SELECT Employee,
  divisions,
  c,
  nc,
  c + nc total,
  ROUND(100 * c / (c + nc - nc_unworked),1) percentChargeable,
  ROUND(100 * nc_worked / (c + nc),1) percentNCWorked,
  nc_worked,
  nc_unworked
FROM base;