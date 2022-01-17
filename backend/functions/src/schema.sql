CREATE TABLE `TimeSheets` (
  `id` varchar(512) NOT NULL DEFAULT '',
  `uid` varchar(128) NOT NULL,
  `givenName` varchar(48) NOT NULL,
  `surname` varchar(32) NOT NULL,
  `managerUid` varchar(128) NOT NULL DEFAULT '',
  `managerName` varchar(80) NOT NULL DEFAULT '',
  `tbtePayrollId` varchar(6) NOT NULL DEFAULT '',
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