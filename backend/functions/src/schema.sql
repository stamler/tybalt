CREATE TABLE `Profiles` (
  `id` varchar(512) NOT NULL,
  `surname` varchar(32) NOT NULL,
  `givenName` varchar(48) NOT NULL,
  `openingDateTimeOff` date NOT NULL,
  `openingOP` int unsigned NOT NULL,
  `openingOV` int unsigned NOT NULL,
  `timestamp` timestamp NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE `TimeSheets` (
  `id` varchar(512) NOT NULL DEFAULT '',
  `uid` varchar(128) NOT NULL,
  `givenName` varchar(48) NOT NULL,
  `surname` varchar(32) NOT NULL,
  `managerUid` varchar(128) NOT NULL DEFAULT '',
  `managerName` varchar(80) NOT NULL DEFAULT '',
  `payrollId` varchar(6) NOT NULL DEFAULT '',
  `workWeekHours` int(11) NOT NULL DEFAULT '40',
  `salary` tinyint(1) NOT NULL,
  `weekEnding` date NOT NULL,
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_id` FOREIGN KEY (`id`) REFERENCES `TimeEntries` (`tsid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE `TimeEntries` (
  `id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `uid` varchar(128) NOT NULL DEFAULT '',
  `tsid` varchar(512) NOT NULL DEFAULT '',
  `date` date NOT NULL,
  `timetype` varchar(5) NOT NULL DEFAULT '',
  `timetypeName` varchar(128) NOT NULL DEFAULT '',
  `division` varchar(5) DEFAULT NULL,
  `divisionName` varchar(128) DEFAULT NULL,
  `client` varchar(128) DEFAULT NULL,
  `job` varchar(16) DEFAULT NULL,
  `workrecord` varchar(16) DEFAULT NULL,
  `jobDescription` varchar(128) DEFAULT NULL,
  `hours` decimal(3,1) DEFAULT NULL,
  `jobHours` decimal(3,1) DEFAULT NULL,
  `mealsHours` decimal(3,1) DEFAULT NULL,
  `workDescription` text,
  `payoutRequestAmount` decimal(7,2) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `fk_tsid` (`tsid`),
  CONSTRAINT `fk_tsid` FOREIGN KEY (`tsid`) REFERENCES `TimeSheets` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE `TimeAmendments` (
  `id` varchar(512) NOT NULL DEFAULT '',
  `creator` varchar(128) NOT NULL,
  `creatorName` varchar(80) NOT NULL,
  `commitUid` varchar(128) NOT NULL DEFAULT '',
  `commitName` varchar(80) NOT NULL DEFAULT '',
  `commitTime` timestamp NOT NULL,
  `created` timestamp NOT NULL,
  `committedWeekEnding` date NOT NULL,
  `uid` varchar(128) NOT NULL DEFAULT '',
  `givenName` varchar(48) NOT NULL DEFAULT '',
  `surname` varchar(32) NOT NULL DEFAULT '',
  `payrollId` varchar(6) NOT NULL DEFAULT '',
  `workWeekHours` int(11) NOT NULL DEFAULT '40',
  `salary` tinyint(1) NOT NULL,
  `weekEnding` date NOT NULL,
  `date` date NOT NULL,
  `timetype` varchar(5) NOT NULL DEFAULT '',
  `timetypeName` varchar(128) NOT NULL DEFAULT '',
  `division` varchar(5) DEFAULT NULL,
  `divisionName` varchar(128) DEFAULT NULL,
  `client` varchar(128) DEFAULT NULL,
  `job` varchar(16) DEFAULT NULL,
  `workrecord` varchar(16) DEFAULT NULL,
  `jobDescription` varchar(128) DEFAULT NULL,
  `hours` decimal(3,1) DEFAULT NULL,
  `jobHours` decimal(3,1) DEFAULT NULL,
  `mealsHours` decimal(3,1) DEFAULT NULL,
  `workDescription` text,
  `payoutRequestAmount` decimal(7,2) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE `Expenses` (
  `id` varchar(512) NOT NULL DEFAULT '',
  `attachment` varchar(2048) DEFAULT NULL,
  `breakfast` tinyint(1) DEFAULT NULL,
  `client` varchar(128) DEFAULT NULL,
  `ccLast4digits` decimal(4,0) DEFAULT NULL,
  `commitName` varchar(80) NOT NULL DEFAULT '',
  `commitTime` timestamp NOT NULL,
  `commitUid` varchar(128) NOT NULL DEFAULT '',
  `committedWeekEnding` date NOT NULL,
  `date` date NOT NULL,
  `description` text,
  `dinner` tinyint(1) DEFAULT NULL,
  `displayName` varchar(80) NOT NULL,
  `distance` int DEFAULT NULL,
  `division` varchar(5) DEFAULT NULL,
  `divisionName` varchar(128) DEFAULT NULL,
  `givenName` varchar(48) NOT NULL DEFAULT '',
  `job` varchar(16) DEFAULT NULL,
  `jobDescription` varchar(128) DEFAULT NULL,
  `lodging` tinyint(1) DEFAULT NULL,
  `lunch` tinyint(1) DEFAULT NULL,
  `managerName` varchar(80) NOT NULL,
  `managerUid` varchar(128) NOT NULL,
  `payPeriodEnding` date NOT NULL,
  `paymentType` varchar(24) NOT NULL,
  `po` varchar(128) DEFAULT NULL,
  `surname` varchar(32) NOT NULL,
  `payrollId` varchar(6) NOT NULL,
  `total` decimal(9,2) DEFAULT NULL,
  `uid` varchar(128) NOT NULL DEFAULT '',
  `unitNumber` varchar(16) DEFAULT NULL,
  `vendorName` varchar(128) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE `AllowanceRates` (
  `effective_date` date NOT NULL,
  `breakfast_rate` decimal(6,2) NOT NULL DEFAULT '0.00',
  `lunch_rate` decimal(6,2) NOT NULL DEFAULT '0.00',
  `dinner_rate` decimal(6,2) NOT NULL DEFAULT '0.00',
  `lodging_rate` decimal(6,2) NOT NULL DEFAULT '0.00',
  PRIMARY KEY (`effective_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;

/* This view calculates the allowanceTotal, that is the amount of each expense
in dollars based on the allowances claimed. This result can be LEFT JOINed to
Expenses ON id = id.*/
CREATE VIEW `ExpenseAllowanceTotals`
AS SELECT
   e.id AS id,
   r.effective_date AS allowance_rates_effective_date,
   r.breakfast_rate AS breakfast_rate,
   r.lunch_rate AS lunch_rate,
   r.dinner_rate AS dinner_rate,
   r.lodging_rate AS lodging_rate,
   (e.breakfast * r.breakfast_rate) + (e.lunch * r.lunch_rate) + (e.dinner * r.dinner_rate) + (e.lodging * r.lodging_rate) AS allowanceTotal,
   CONCAT(
    IF(e.breakfast, "Breakfast ", ""),
    IF(e.lunch, "Lunch ", ""),
    IF(e.dinner, "Dinner ", ""),
    IF(e.lodging, "Lodging ", "")
   ) allowanceDescription
FROM (Expenses e LEFT JOIN AllowanceRates r ON ((r.effective_date = (SELECT MAX(i.effective_date) FROM AllowanceRates i WHERE (i.effective_date <= e.date)))))
WHERE e.paymentType = 'Allowance' OR e.paymentType = 'Meals';

CREATE TABLE `MileageRateGroups` (
  `id` varchar(128) NOT NULL,
  `effective_date` date NOT NULL,
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_tiers` FOREIGN KEY (`id`) REFERENCES `MileageTiers` (`rate_group_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

CREATE TABLE `MileageTiers` (
  `id` int(11) unsigned NOT NULL AUTO_INCREMENT,
  `rate_group_id` varchar(128) NOT NULL DEFAULT '',
  `lower_bound` int unsigned NOT NULL DEFAULT '0',
  `rate` decimal(5,2) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `fk_rate_groups` (`rate_group_id`),
  CONSTRAINT `fk_rate_groups` FOREIGN KEY (`rate_group_id`) REFERENCES `MileageRateGroups` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=10 DEFAULT CHARSET=utf8;

/* This query calculates the mileageTotal, that is the amount of each expense in
 dollars based on the distance claimed and the mileage tier for each claim. IF
 the claim spans two mileage tiers, this is accounted for and the calculation is
 performed piecewise for each tier. This result can be LEFT JOINed to Expenses ON
 id = id. */
CREATE VIEW ExpenseMileageTotals AS (
  WITH no_tiers AS (
    SELECT e.id,
      e.surname,
      e.date,
      r.date reset_mileage_date,
      distance,
      sum(distance) over (
        partition by uid,
        r.date
        order by date
      ) as cumulative_distance,
      m.id mileageRateGroupId
    FROM Expenses e
      INNER JOIN MileageResetDates r ON r.date = (
        SELECT MAX(r2.date)
        FROM MileageResetDates r2
        WHERE r2.date <= e.date
      )
      LEFT JOIN MileageRateGroups m ON m.effective_date = (
        SELECT MAX(m2.effective_date)
        FROM MileageRateGroups m2
        WHERE m2.effective_date <= e.date
      )
    WHERE e.paymentType = "Mileage"
    ORDER BY uid,
      date
  )
  SELECT no_tiers.*,
    lt.rate lower_rate,
    ut.lower_bound lower_rate_cutoff,
    ut.rate upper_rate,
    IF(lt.rate = ut.rate, NULL, TRUE) multi_tier,
    IF(
      lt.rate = ut.rate,
      lt.rate * distance,
      (cumulative_distance - ut.lower_bound) * ut.rate + (ut.lower_bound + distance - cumulative_distance) * lt.rate
    ) mileageTotal
  FROM no_tiers
    LEFT JOIN MileageTiers lt ON lt.id = (
      SELECT id
      FROM (
          SELECT *,
            ROW_NUMBER() OVER(
              ORDER BY lower_bound DESC
            ) rn
          FROM MileageTiers t2
          WHERE t2.lower_bound <= (no_tiers.cumulative_distance - no_tiers.distance)
            AND t2.rate_group_id = no_tiers.mileageRateGroupId
        ) lower_tier_candidates
      WHERE rn = 1
    )
    LEFT JOIN MileageTiers ut ON ut.id = (
      SELECT id
      FROM (
          SELECT *,
            ROW_NUMBER() OVER(
              ORDER BY lower_bound DESC
            ) rn
          FROM MileageTiers t3
          WHERE t3.lower_bound <= no_tiers.cumulative_distance
            AND t3.rate_group_id = no_tiers.mileageRateGroupId
        ) upper_tier_candidates
      WHERE rn = 1
    )
)

/* This query joins the Expenses with their calculated values for allowances and
mileage. It is used as the source for the payables CSV. The only remaining task
is to filter the dates, calculate the taxes, and rename columns to finish the
CSV report */
CREATE VIEW ExpensePayablesShell AS
SELECT e.*, 
  CASE
    WHEN paymentType = "Mileage" THEN m.mileageTotal
    WHEN paymentType = "Allowance" OR paymentType = "Meals" THEN a.allowanceTotal
    ELSE total
  END mergedTotal,
  CASE
    WHEN paymentType = "Allowance" OR paymentType = "Meals" THEN a.allowanceDescription
    ELSE description
  END mergedDescription
FROM Expenses e
LEFT JOIN ExpenseMileageTotals m ON m.id = e.id
LEFT JOIN ExpenseAllowanceTotals a ON a.id = e.id
