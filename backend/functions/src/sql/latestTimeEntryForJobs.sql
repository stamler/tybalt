/* ---------------------------------------------------------------------
 *
 * latestTimeEntryForJobs
 *
  * This function returns the latest rows (by the date column) in the
  * TimeEntries table for each job found in the job column.
 * ---------------------------------------------------------------------
 */

SELECT job, MAX(date) date FROM TimeEntries WHERE job IS NOT NULL GROUP BY job ORDER BY date DESC;