export interface TimeSheet {
  // required properties always
  uid: string;
  displayName: string;
  surname: string;
  givenName: string;
  managerUid: string;
  bankedHours: number;
  mealsHoursTally: number;
  divisionsTally: { [x: string]: string };
  jobsTally: {
    [job: string]: {
      description: string;
      client: string;
      hours: number;
      jobHours: number;
      manager?: string;
      proposal?: string;
      status?: string;
      clientContact?: string;
    };
  };
  entries: any[];

  // others to be filled in later
  [x: string]: any;
}

export interface Amendment {
  // required properties always
  date: string;
  created: string;
  committed: string;
  committedWeekEnding: string;
  weekEnding: string;
  creator: string;
  creatorName: string;
  displayName: string;
  surname: string;
  givenName: string;
  timetype: string;
  timetypeName: string;
  amendment: true;
  uid: string;

  // properties which are never required, but may require eachother
  division?: string;
  divisionName?: string;
  workDescription?: string;
  hours?: number;
  mealsHours?: number;
  client?: string;
  job?: string;
  jobDescription?: string;
  workrecord?: string;
  jobHours?: number;
  salary?: boolean;
  tbtePayrollId?: number | string;
}

export type TimeOffTypes = "OB" | "OH" | "OP" | "OS" | "OV";

// Type Guard
export function isTimeSheet(data: any): data is TimeSheet {
  // check optional string properties have correct type
  const optionalStringVals = ["surname", "givenName"]
    .map((x) => data[x] === undefined || typeof data[x] === "string")
    .every((x) => x === true);
  // check string properties exist and have correct type
  const stringVals = ["uid", "displayName", "managerUid"]
    .map((x) => data[x] !== undefined && typeof data[x] === "string")
    .every((x) => x === true);
  // check number properties exist and have correct type
  const numVals = ["bankedHours", "mealsHoursTally"]
    .map((x) => data[x] !== undefined && typeof data[x] === "number")
    .every((x) => x === true);
  // check the divisions tally, return false on first type mismatch
  for (const key in data.divisionsTally) {
    if (typeof key !== "string") {
      return false;
    }
    if (typeof data.divisionsTally[key] !== "string") {
      return false;
    }
  }
  // check the jobs tally, return false on first type mismatch of key
  // TODO: implement checking value
  for (const key in data.jobsTally) {
    if (typeof key !== "string") {
      return false;
    }
  }
  return optionalStringVals && stringVals && numVals;
}

export interface PayrollReportRecord {
  weekEnding: string;
  displayName: string;
  surname: string;
  givenName: string;
  managerName: string;
  mealsHoursTally?: number;
  offRotationDaysTally?: number;
  R?: number;
  OB?: number;
  OH?: number;
  OP?: number;
  OS?: number;
  OV?: number;
  RB?: number;
  payoutRequest?: number;
  hasAmendmentsForWeeksEnding?: string[];
  salary?: boolean;
  tbtePayrollId?: number | string;
}
