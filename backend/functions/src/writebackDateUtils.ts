import * as admin from "firebase-admin";
import { zonedTimeToUtc } from "date-fns-tz";
import { APP_NATIVE_TZ } from "./config";

export function toNoonEasternTimestamp(value: unknown): admin.firestore.Timestamp | unknown {
  if (typeof value !== "string") {
    return value;
  }
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return value;
  }
  const noonEastern = zonedTimeToUtc(`${trimmed}T12:00:00`, APP_NATIVE_TZ);
  return admin.firestore.Timestamp.fromDate(noonEastern);
}

export function toEndOfDayTimestamp(value: unknown): admin.firestore.Timestamp | unknown {
  if (typeof value !== "string") {
    return value;
  }
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return value;
  }
  const endOfDay = zonedTimeToUtc(`${trimmed}T23:59:59.999`, APP_NATIVE_TZ);
  return admin.firestore.Timestamp.fromDate(endOfDay);
}

export function toTimestampFromISO(value: unknown): admin.firestore.Timestamp | unknown {
  if (typeof value !== "string") {
    return value;
  }
  const parsed = new Date(value);
  if (isNaN(parsed.getTime())) {
    return value;
  }
  return admin.firestore.Timestamp.fromDate(parsed);
}

export function normalizeTimeAmendmentWritebackData(
  amendment: Record<string, unknown>
): Record<string, unknown> {
  const converted = { ...amendment };

  if ("date" in converted) {
    converted["date"] = toNoonEasternTimestamp(converted["date"]);
  }
  if ("weekEnding" in converted) {
    converted["weekEnding"] = toEndOfDayTimestamp(converted["weekEnding"]);
  }
  if ("committedWeekEnding" in converted) {
    converted["committedWeekEnding"] = toEndOfDayTimestamp(converted["committedWeekEnding"]);
  }
  if ("commitTime" in converted) {
    converted["commitTime"] = toTimestampFromISO(converted["commitTime"]);
  }
  if ("created" in converted) {
    converted["created"] = toTimestampFromISO(converted["created"]);
  }


  return converted;
}
