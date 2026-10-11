import { closeSync, createReadStream, createWriteStream, openSync, rmSync, writeFileSync, type ReadStream, type WriteStream } from "node:fs"
import { rm } from "node:fs/promises"
import { Readable } from "node:stream"
import { pipeline } from "node:stream/promises"

import { ZipFile } from "yazl"

import type { ExportColumns, ExportRow } from "./bilibili-live-session-xlsx"

const chunkSize = 64 * 1024
// Character.isWhitespace(char), including its control whitespace and excluding NBSP.
const javaWhitespace = /[\u0009-\u000d\u001c-\u0020\u1680\u2000-\u2006\u2008-\u200a\u2028\u2029\u205f\u3000]/u

export function writeSnapshotCsv<T>(
  path: string,
  columns: ExportColumns,
  values: Iterable<T>,
  toRow: (value: T) => ExportRow
): number {
  // EEXIST occurs before cleanup can claim ownership of the target.
  const descriptor = openSync(path, "wx")
  let complete = false
  let count = 0
  try {
    writeFileSync(descriptor, "\uFEFF", "utf8")
    writeCsvRow(descriptor, columns.headers)
    writeCsvRow(descriptor, columns.comments)
    for (const value of values) {
      writeCsvRow(descriptor, toRow(value))
      count += 1
    }
    complete = true
    return count
  } finally {
    try {
      closeSync(descriptor)
    } catch (error) {
      complete = false
      throw error
    } finally {
      if (!complete) rmSync(path, { force: true })
    }
  }
}

function writeCsvRow(descriptor: number, values: readonly (string | number | boolean | null)[]): void {
  writeFileSync(descriptor, `${values.map(csvField).join(",")}\r\n`, "utf8")
}

function csvField(value: string | number | boolean | null): string {
  let text = value === null ? "" : String(value)
  if (typeof value === "string" && isFormula(text)) text = `'${text}`
  return /[,"\r\n]/u.test(text) ? `"${text.replace(/"/gu, '""')}"` : text
}

function isFormula(text: string): boolean {
  let index = 0
  while (index < text.length && javaWhitespace.test(text.charAt(index))) {
    if (text.charCodeAt(index) < 0x20) return true
    index += 1
  }
  return index < text.length && "=+-@".includes(text.charAt(index))
}

export async function writeSnapshotZip(
  path: string,
  entries: readonly { name: string; path: string }[],
  signal?: AbortSignal
): Promise<void> {
  signal?.throwIfAborted()
  const descriptor = openSync(path, "wx")
  const zip = new ZipFile()
  // yazl creates a PassThrough, but its declaration only exposes ReadableStream.
  const source = zip.outputStream as Readable
  const sourceClosed = new Promise<void>((resolve) => source.once("close", resolve))
  const inputs = new Set<ReadStream>()
  const inputsClosed: Promise<void>[] = []
  let output: WriteStream | undefined
  let outputClosed: Promise<void> | undefined
  let cancelled = false
  let writeError: Error | undefined
  const abort = (error: Error, fromZip = false) => {
    if (cancelled) return
    cancelled = true
    writeError = error
    // Let yazl's public error handling stop any later entry pumps as well.
    if (!fromZip) zip.emit("error", error)
    for (const input of inputs) input.destroy()
    source.destroy(error)
    output?.destroy(error)
  }
  zip.on("error", (error: Error) => abort(error, true))
  source.on("error", abort)
  const onAbort = () => abort(signal?.reason instanceof Error ? signal.reason : new Error(String(signal?.reason)))
  try {
    const stream = createWriteStream(path, { fd: descriptor, autoClose: true, highWaterMark: chunkSize })
    output = stream
    outputClosed = new Promise<void>((resolve) => stream.once("close", resolve))
    stream.on("error", abort)
    signal?.addEventListener("abort", onAbort, { once: true })
    signal?.throwIfAborted()
    for (const entry of entries) {
      zip.addReadStreamLazy(entry.name, { mtime: new Date(0), compressionLevel: 6 }, (callback) => {
        // yazl ignores the stream argument on error; its types still require it.
        if (cancelled) {
          callback(writeError ?? new Error("ZIP export cancelled."), source)
          return
        }
        try {
          const input = createReadStream(entry.path, { highWaterMark: chunkSize })
          inputs.add(input)
          inputsClosed.push(new Promise<void>((resolve) => input.once("close", () => {
            inputs.delete(input)
            resolve()
          })))
          input.once("error", (error) => zip.emit("error", error))
          callback(null, input)
        } catch (error) {
          callback(error instanceof Error ? error : new Error(String(error)), source)
        }
      })
    }
    zip.end()
    await pipeline(source, stream)
    await outputClosed
    await Promise.all(inputsClosed)
    signal?.throwIfAborted()
  } catch (error) {
    abort(error instanceof Error ? error : new Error(String(error)))
    try {
      if (output) {
        await outputClosed
      } else {
        closeSync(descriptor)
      }
      await sourceClosed
      await Promise.all(inputsClosed)
    } finally {
      await rm(path, { force: true })
    }
    throw error
  } finally {
    signal?.removeEventListener("abort", onAbort)
  }
}
