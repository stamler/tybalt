/* This query gets balances for timeOffTallies including TimeAmendments */

WITH entries AS(
SELECT e.id, 
e.uid,
FALSE AS amendment,
s.weekEnding,
s.surname,
s.givenName,
CASE WHEN e.timetype = "OP" THEN e.hours END OP,
CASE WHEN e.timetype = "OV" THEN e.hours END OV
FROM TimeEntries e
LEFT JOIN TimeSheets s
ON s.id = e.tsid
LEFT JOIN Profiles p
ON p.id = s.uid
WHERE (e.timetype = "OP" OR e.timetype = "OV")
UNION
SELECT a.id,
a.uid,
TRUE AS amendment,
a.committedWeekEnding weekEnding,
a.surname,
a.givenName,
CASE WHEN a.timetype = "OP" THEN a.hours END OP,
CASE WHEN a.timetype = "OV" THEN a.hours END OV
FROM TimeAmendments a
WHERE (a.timetype = "OP" OR a.timetype = "OV")
)

SELECT e.uid,
e.surname,
e.givenName,
p.openingDateTimeOff,
p.openingOP,
IFNULL(SUM(e.OP),0) usedOP,
p.openingOP - IFNULL(SUM(e.OP),0) remainingOP,
p.openingOV,
IFNULL(SUM(e.OV),0) usedOV,
p.openingOV - IFNULL(SUM(OV),0) remainingOV
FROM entries e
LEFT JOIN Profiles p
ON p.id = e.uid
WHERE e.weekEnding > p.openingDateTimeOff AND p.untrackedTimeOff = FALSE
GROUP BY e.uid
ORDER BY surname