SELECT TimeSheets.surname,
  TimeSheets.givenName,
  MIN(TimeSheets.weekEnding) AS firstTimeSheet,
  MAX(TimeSheets.weekEnding) AS lastTimeSheet,
  COUNT(DISTINCT(TimeSheets.id)) AS timeSheetsCount,
  COUNT(DISTINCT(TimeEntries.id)) AS timeEntriesCount
FROM TimeSheets
  RIGHT OUTER JOIN TimeEntries ON TimeSheets.id = TimeEntries.tsid
GROUP BY TimeSheets.uid
ORDER BY TimeSheets.surname ASC;