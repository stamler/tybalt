/* A query to replace generatePayablesCSV() in the old backend. This is the
highest-level query that outputs the CSV and relies on views with manipulate the
underlying data */
SELECT tbtePayrollId,
  paymentType "Acct/Visa/Exp",
  job "Job #",
  client Client,
  jobDescription "Job Description",
  division "Div",
  DAYOFMONTH(e.date) Date,
  DATE_FORMAT(e.date, "%b") Month,
  YEAR(e.date) Year,
  mergedTotal - ROUND(mergedTotal * 13 / 113, 2) calculatedSubtotal,
  ROUND(mergedTotal * 13 / 113, 2) calculatedOntarioHST,
  mergedTotal Total,
  po "PO#",
  mergedDescription Description,
  vendorName Company,
  displayName Employee,
  managerName "Approved By"
FROM ExpensePayablesShell e
WHERE e.payPeriodEnding = ?
ORDER BY e.date