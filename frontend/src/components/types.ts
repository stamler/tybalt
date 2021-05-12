import firebase from "../firebase";

export interface TimeEntry {
  // required properties always
  date: firebase.firestore.Timestamp;
  timetype: string;
  timetypeName: string;
  uid: string;

  // required properties for TimeEntries pulled from collection
  weekEnding: firebase.firestore.Timestamp;

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
  payoutRequestAmount?: number;
}

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
export function isTimeSheet(data: unknown): data is TimeSheet {
  if (!isObject(data)) {
    return false;
  }
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
  if (!isObject(data.divisionsTally)) {
    return false;
  }
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
  if (!isObject(data.jobsTally)) {
    return false;
  }
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

interface ExpenseCommon {
  uid: string;
  displayName: string;
  surname: string;
  givenName: string;
  committedWeekEnding: string;
  commitTime: string;
  commitName: string;
  commitUid: string;
  managerName: string;
  managerUid: string;
  description: string;
  date: string;
  division: string;
  divisionName: string;
  payPeriodEnding: string;
  client?: string;
  job?: string;
  jobDescription?: string;
}
interface ExpenseRegular extends ExpenseCommon {
  paymentType: "Expense" | "CorporateCreditCard" | "FuelCard" | "FuelOnAccount";
  total: number;
  vendorName?: string;
  attachment?: string;
  unitNumber?: number;
  po?: string;
}
interface ExpenseMileage extends ExpenseCommon {
  paymentType: "Mileage";
  distance: number;
}

export type Expense = ExpenseRegular | ExpenseMileage;

// Type Guards
function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x != null;
}

function isExpenseCommon(data: unknown): data is ExpenseCommon {
  if (!isObject(data)) {
    return false;
  }
  // check optional string properties have correct type
  const optionalStringVals = ["client", "job", "jobDescription"]
    .map((x) => data[x] === undefined || typeof data[x] === "string")
    .every((x) => x === true);
  // check string properties exist and have correct type
  const stringVals = [
    "uid",
    "displayName",
    "surname",
    "givenName",
    "committedWeekEnding",
    "commitTime",
    "commitName",
    "commitUid",
    "managerName",
    "managerUid",
    "description",
    "date",
    "division",
    "divisionName",
  ]
    .map((x) => data[x] !== undefined && typeof data[x] === "string")
    .every((x) => x === true);
  return optionalStringVals && stringVals;
}

function isExpenseRegular(data: unknown): data is ExpenseRegular {
  if (!isObject(data)) {
    return false;
  }
  const paymentType =
    data.paymentType === "Expense" ||
    data.paymentType === "FuelCard" ||
    data.paymentType === "CorporateCreditCard";
  const total = typeof data.total === "number" && data.total > 0;
  const optionalStringVals = ["vendorName", "attachment", "po"]
    .map((x) => data[x] === undefined || typeof data[x] === "string")
    .every((x) => x === true);
  return isExpenseCommon(data) && paymentType && total && optionalStringVals;
}

function isExpenseMileage(data: unknown): data is ExpenseMileage {
  if (!isObject(data)) {
    return false;
  }
  const paymentType = data.paymentType === "Mileage";
  const distance =
    typeof data.distance === "number" &&
    data.distance > 0 &&
    Number.isInteger(data.distance);
  return isExpenseCommon(data) && paymentType && distance;
}

export function isExpense(data: unknown): data is Expense {
  return isExpenseRegular(data) || isExpenseMileage(data);
}
