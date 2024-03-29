SELECT TimeSheets.givenName,
  TimeSheets.surname,
  job,
  SUM(IFNULL(jobHours, 0)) jobHours,
  SUM(IFNULL(Profiles.defaultChargeOutRate,0) * IFNULL(jobHours, 0)) jobValue,
  SUM(IFNULL(hours, 0)) hours,
  SUM(IFNULL(mealsHours, 0)) mealsHours,
  TimeEntries.uid uid
FROM TimeEntries
  LEFT OUTER JOIN TimeSheets ON TimeEntries.tsid = TimeSheets.id
  LEFT OUTER JOIN Profiles ON TimeSheets.uid = Profiles.id
WHERE job REGEXP CONCAT("^", ?) AND date >= ? AND date <= ?
GROUP BY job,
  uid;