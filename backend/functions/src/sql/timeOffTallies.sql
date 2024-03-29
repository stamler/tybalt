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
a.weekEnding weekEnding,
a.surname,
a.givenName,
CASE WHEN a.timetype = "OP" THEN a.hours END OP,
CASE WHEN a.timetype = "OV" THEN a.hours END OV
FROM TimeAmendments a
WHERE (a.timetype = "OP" OR a.timetype = "OV")
)

/* The entries table now contains all OP and OV entries for a user whether
regular time or amendment. For Amendments, the weekEnding column is the
weekEnding column from the TimeAmendments table, NOT the committedWeekEnding.
This is because we may retroactively create amendments to amend time off in a
previous period (year) and we don't want this amendment to be applied to the
current period (year) */

/*
We need to ensure that all of the entries are in the current period (year).
Specifically, we ensure that only the entries which are after the
openingDateTimeOff are included
*/

SELECT e.uid,
e.surname,
e.givenName,
p.openingDateTimeOff,
p.openingOP,
IFNULL(SUM(e.OP),0) usedOP,
p.openingOP - IFNULL(SUM(e.OP),0) remainingOP,
p.openingOV,
IFNULL(SUM(e.OV),0) usedOV,
p.openingOV - IFNULL(SUM(OV),0) remainingOV,
MAX(e.weekEnding) usedAsOf, /* This is the last weekEnding with time off claimed, not the most recent time sheet */
/* The time must first be set to 23:59:59.999 prior to conversion to UTC */
UNIX_TIMESTAMP(CONVERT_TZ(ADDTIME(MAX(e.weekEnding),"23:59:59.999"), 'America/Thunder_bay', @@global.time_zone)) * 1000 jsDateWeekEnding
FROM entries e
LEFT JOIN Profiles p
ON p.id = e.uid
WHERE e.weekEnding > p.openingDateTimeOff AND p.untrackedTimeOff = FALSE
GROUP BY e.uid
ORDER BY surname