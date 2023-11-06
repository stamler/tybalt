/*
TODO: join the invoice totals to each division like this

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
WHERE job = '22-052-1' AND date >= '2021-01-01' AND date <= '2023-11-05'
GROUP BY job,
  division
),
invoiceLines AS (
  SELECT iline.lineType, iline.description, SUM(iline.amount) AS invoicedAmount
  FROM Invoices i
  JOIN InvoiceLineItems iline ON i.id = iline.invoiceid
  WHERE i.job = '22-052-1'
  GROUP BY iline.lineType, iline.description
  )
SELECT job, division, jobHours, jobValue$, total$, ROUND((jobValue$ * 100 / total$),1) as 'jobValue%', hours, lineType, description, invoicedAmount from base
LEFT JOIN invoiceLines on base.division = invoiceLines.description
UNION
SELECT job, division, jobHours, jobValue$, total$, ROUND((jobValue$ * 100 / total$),1) as 'jobValue%', hours, lineType, description, invoicedAmount from base
RIGHT JOIN invoiceLines on base.division = invoiceLines.description

*/

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