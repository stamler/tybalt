SELECT givenName,
  surname,
  job,
  SUM(IFNULL(jobHours, 0)) jobHours,
  SUM(IFNULL(hours, 0)) hours,
  SUM(IFNULL(mealsHours, 0)) mealsHours,
  TimeEntries.uid uid
FROM TimeEntries
  LEFT OUTER JOIN TimeSheets ON TimeEntries.tsid = TimeSheets.id
WHERE job = ? AND date >= ? AND date <= ?
GROUP BY job,
  uid;