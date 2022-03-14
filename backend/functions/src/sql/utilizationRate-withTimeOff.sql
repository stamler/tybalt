/*billable hours divided by total hours in query as % grouped by week */
SELECT DATE_FORMAT(date, "%X-W%V") week,
  MIN(date) earliest,
  MAX(date) lastest,
  IFNULL(SUM(jobHours), 0) jobHours,
  IFNULL(SUM(hours), 0) hours,
  IFNULL(SUM(hours), 0) + IFNULL(SUM(jobHours), 0) totalHours,
  IFNULL(SUM(jobHours), 0) * 100 / (IFNULL(SUM(hours), 0) + IFNULL(SUM(jobHours), 0)) "billable percentage"
FROM TimeEntries
WHERE date > "2021-06-12"
GROUP BY DATE_FORMAT(date, "%X-W%V");