import { Timestamp, Query } from "firebase/firestore";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type TableData = Record<string, any>[] | undefined;

export interface QueryPayloadObject {
  queryName: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  queryValues?: any[];
}

// https://www.qualdesk.com/blog/2021/type-guard-for-string-union-types-typescript/
export const ALLOWED_INVOICE_LINE_TYPES = [
  "subcontractor",
  "expense",
  "division",
] as const;
export type InvoiceLineItemType = (typeof ALLOWED_INVOICE_LINE_TYPES)[number];

export interface InvoiceLineObject {
  lineType: InvoiceLineItemType;
  description: string;
  amount: number;
}

export interface TimeEntry {
  // required properties always
  date: Timestamp;
  timetype: string;
  timetypeName: string;
  uid: string;

  // required properties for TimeEntries pulled from collection
  weekEnding: Timestamp;

  // properties which are never required, but may require eachother
  division?: string;
  divisionName?: string;
  workDescription?: string;
  hours?: number;
  mealsHours?: number;
  client?: string;
  job?: string;
  jobDescription?: string;
  category?: string;
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  entries: any[];

  // others to be filled in later
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [x: string]: any;
}

export interface UnwoundTimeSheet extends Omit<TimeSheet, "entries"> {
  entries: {
    division: string;
    timetype: string;
    client?: string;
    job?: string;
    jobHours?: number;
    hours?: number;
    mealsHours?: number;
    workrecord?: string;
    jobDescription?: string;
    workDescription?: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [x: string]: any;
  };
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
  category?: string;
  workrecord?: string;
  jobHours?: number;
  salary?: boolean;
  payrollId: number | string;
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

// export interface PayrollReportRecord {
//   weekEnding: string;
//   workWeekHours?: number;
//   displayName: string;
//   surname: string;
//   givenName: string;
//   managerName: string;
//   mealsHoursTally?: number;
//   offRotationDaysTally?: number;
//   R?: number;
//   OB?: number;
//   OH?: number;
//   OP?: number;
//   OS?: number;
//   OV?: number;
//   RB?: number;
//   payoutRequest?: number;
//   hasAmendmentsForWeeksEnding?: string[];
//   salary?: boolean;
//   payrollId: number | string;
// }

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
  date: string;
  division: string;
  divisionName: string;
  payPeriodEnding: string;
  client?: string;
  job?: string;
  jobDescription?: string;
  category?: string;
}
interface ExpenseRegular extends ExpenseCommon {
  paymentType: "Expense" | "CorporateCreditCard" | "FuelCard" | "FuelOnAccount";
  total: number;
  description: string;
  vendorName?: string;
  attachment?: string;
  unitNumber?: number;
  po?: string;
}
interface ExpensePersonal extends ExpenseCommon {
  paymentType: "PersonalReimbursement";
  total: number;
  description: string;
}
interface ExpenseMileage extends ExpenseCommon {
  paymentType: "Mileage";
  description: string;
  distance: number;
  mileageClaimed: number;
}

export interface ExpenseMeals extends ExpenseCommon {
  paymentType: "Meals";
  breakfast: boolean;
  lunch: boolean;
  dinner: boolean;
}

export interface ExpenseAllowance extends ExpenseCommon {
  paymentType: "Allowance";
  breakfast: boolean;
  lunch: boolean;
  dinner: boolean;
  lodging: boolean;
}

export interface MissingTimeSheetRecord {
  displayName: string;
  uid: string;
  tsid: string;
  status: "submitted" | "approved" | "locked" | "other";
}

export type Expense =
  | ExpenseRegular
  | ExpenseMileage
  | ExpenseMeals
  | ExpensePersonal
  | ExpenseAllowance;

// Type Guards
function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x != null;
}

interface DocIdObject {
  // the id of a document
  id: string;
}
export function isDocIdObject(data: unknown): data is DocIdObject {
  if (!isObject(data)) {
    return false;
  }
  return typeof data.id === "string";
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
    data.paymentType === "CorporateCreditCard" ||
    data.paymentType === "FuelOnAccount";
  const total = typeof data.total === "number" && data.total > 0;
  const optionalStringVals = ["description", "vendorName", "attachment", "po"]
    .map((x) => data[x] === undefined || typeof data[x] === "string")
    .every((x) => x === true);
  return isExpenseCommon(data) && paymentType && total && optionalStringVals;
}
function isExpensePersonal(data: unknown): data is ExpensePersonal {
  if (!isObject(data)) {
    return false;
  }
  const total = typeof data.total === "number" && data.total > 0;

  return (
    isExpenseCommon(data) &&
    data.paymentType === "PersonalReimbursement" &&
    total &&
    typeof data.description === "string"
  );
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
  const description = typeof data.description === "string";
  const mileageClaimed = typeof data.mileageClaimed === "number";
  return (
    isExpenseCommon(data) &&
    paymentType &&
    distance &&
    description &&
    mileageClaimed
  );
}

export function isExpenseMeals(data: unknown): data is ExpenseMeals {
  if (!isObject(data)) {
    return false;
  }
  const paymentType = data.paymentType === "Meals";
  const meals =
    typeof data.breakfast === "boolean" &&
    typeof data.lunch === "boolean" &&
    typeof data.dinner === "boolean";
  return isExpenseCommon(data) && paymentType && meals;
}
function isExpenseAllowance(data: unknown): data is ExpenseAllowance {
  if (!isObject(data)) {
    return false;
  }
  const paymentType =
    data.paymentType === "Allowance" || data.paymentType === "Meals";
  const allowance =
    typeof data.breakfast === "boolean" &&
    typeof data.lunch === "boolean" &&
    typeof data.dinner === "boolean" &&
    typeof data.lodging === "boolean";
  return isExpenseCommon(data) && paymentType && allowance;
}
export function isExpense(data: unknown): data is Expense {
  return (
    isExpenseRegular(data) ||
    isExpenseMileage(data) ||
    isExpensePersonal(data) ||
    isExpenseMeals(data) ||
    isExpenseAllowance(data)
  );
}

export function isMissingTimeSheetRecord(
  data: unknown
): data is MissingTimeSheetRecord {
  if (!isObject(data)) {
    return false;
  }
  // if every property is a string, return true
  return ["displayName", "uid", "tsid", "status"]
    .map((x) => data[x] !== undefined && typeof data[x] === "string")
    .every((x) => x === true);
}

export function isMissingTimeSheetRecords(
  array: unknown
): array is MissingTimeSheetRecord[] {
  if (!Array.isArray(array)) {
    return false;
  }
  if (array.length === 0) {
    return true;
  }
  return isMissingTimeSheetRecord(array[0]);
}

export interface Profile {
  displayName: string;
  email: string;
  userSourceAnchor64: string;
  mobilePhone?: string;
  surname: string;
  givenName: string;
  jobTitle?: string;
  userSourceAnchor: string;
  azureId: string;
  salary: boolean;
  defaultDivision?: string;
  managerUid?: string;
  managerName?: string;
  timeSheetExpected: boolean;
  customClaims: Record<string, boolean>;
  openingOV: number;
  openingOP: number;
  mileageClaimed: number;
  openingDateTimeOff: Timestamp;
  mileageClaimedSince: Timestamp;
  payrollId: number | string;
  offRotation: boolean;
  defaultChargeOutRate: number;
  usedOV: number;
  usedOP: number;
  usedAsOf: Timestamp;
  msGraphDataUpdated: Timestamp;
  personalVehicleInsuranceExpiry?: Timestamp;
  doNotAcceptSubmissions?: boolean;
  location?: string;
  location_time?: Timestamp;
  alternateManager?: string;
  untrackedTimeOff?: boolean;
  allowPersonalReimbursement?: boolean;
  bot?: string;
  workWeekHours?: number;
}

export interface DSListConfig {
  header: string;
  query: Query;
  actions: {
    type: string;
    handler: Function;
  }[];
}