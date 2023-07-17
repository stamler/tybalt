SELECT client,
  job,
  division,
  timetype,
  DATE_FORMAT(date, "%d") date,
  DATE_FORMAT(date, "%b") Month,
  DATE_FORMAT(date, "%Y") Year,
  IFNULL(jobHours, 0) qty,
  "hours" unit,
  IFNULL(hours, 0) nc,
  IFNULL(mealsHours, 0) meals,
  workrecord ref,
  jobDescription project,
  workDescription description,
  "" comments,
  CONCAT(givenName, " ", surname) employee,
  surname,
  givenName,
  IFNULL(category,'') category
FROM TimeEntries
  LEFT OUTER JOIN TimeSheets ON TimeEntries.tsid = TimeSheets.id
WHERE job = ?
ORDER BY Year,
  Month,
  date;