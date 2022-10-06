/* jsDate is 00:00:00.0 in Thunder Bay Timezone and can be used to instantiate a
Date() object directly */
SELECT e.uid, e.surname, SUM(e.distance) mileageClaimed, r.date mileageClaimedSince, UNIX_TIMESTAMP(CONVERT_TZ(r.date, 'America/Thunder_bay', @@global.time_zone))
 * 1000 jsDate
FROM Expenses e
LEFT JOIN MileageResetDates r ON r.date = (SELECT MAX(date) FROM MileageResetDates k WHERE k.date <= e.date)
WHERE paymentType= "Mileage" AND r.date = (SELECT MAX(date) FROM MileageResetDates)
GROUP BY e.uid, r.date
ORDER BY r.date DESC, mileageClaimed DESC
