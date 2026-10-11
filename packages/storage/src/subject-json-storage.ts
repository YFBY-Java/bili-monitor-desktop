import { serializeJacksonPostgresJson } from "./postgres-json-storage"

/** Retain the Subject storage contract and its original safe error messages. */
export function serializeSubjectJson(value: unknown): string {
  return serializeJacksonPostgresJson(value, "Subject")
}
