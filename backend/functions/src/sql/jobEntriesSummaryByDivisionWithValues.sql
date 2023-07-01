WITH base AS (
SELECT
  job,
  division,
  SUM(IFNULL(jobHours, 0)) jobHours,
  SUM(IFNULL(Profiles.defaultChargeOutRate,0) * IFNULL(jobHours, 0)) jobValue$,
  SUM(SUM(IFNULL(Profiles.defaultChargeOutRate,0) * IFNULL(jobHours, 0))) over() total$,
  SUM(IFNULL(hours, 0)) hours
FROM TimeEntries
  LEFT OUTER JOIN TimeSheets ON TimeEntries.tsid = TimeSheets.id
  LEFT OUTER JOIN Profiles ON TimeSheets.uid = Profiles.id
WHERE job = ? AND date >= ? AND date <= ?
GROUP BY job,
  division
)
SELECT job, division, jobHours, jobValue$, total$, ROUND((jobValue$ * 100 / total$),1) as 'jobValue%', hours from base