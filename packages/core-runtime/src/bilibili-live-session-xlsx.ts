import { closeSync, createWriteStream, openSync, writeFileSync } from "node:fs"
import { open, rm } from "node:fs/promises"
import { createInterface } from "node:readline"
import { setImmediate } from "node:timers/promises"
import { finished } from "node:stream/promises"

import ExcelJS from "exceljs"

import { ExcelJsWorksheetInputs, type StreamingWorkbook } from "./exceljs-worksheet-input"

export interface ExportColumns {
  headers: readonly string[]
  comments: readonly string[]
}

export type ExportRow = Array<string | number | boolean | null>

export interface XlsxSnapshotSheet {
  name: string
  columns: ExportColumns
  path: string
  rowCount: number
}

export function writeSnapshotRows<T>(
  path: string,
  values: Iterable<T>,
  toRow: (value: T) => ExportRow
): number {
  const descriptor = openSync(path, "wx")
  let count = 0
  try {
    for (const value of values) {
      writeFileSync(descriptor, `${JSON.stringify(toRow(value))}\n`, "utf8")
      count += 1
    }
    return count
  } finally {
    closeSync(descriptor)
  }
}

export async function writeSnapshotXlsx(
  path: string,
  sheets: readonly XlsxSnapshotSheet[],
  signal?: AbortSignal
): Promise<void> {
  signal?.throwIfAborted()
  // Claim the file synchronously: EEXIST must never delete another export.
  const descriptor = openSync(path, "wx")
  const output = createWriteStream(path, { fd: descriptor, autoClose: true })
  const outputClosed = new Promise<void>((resolve) => output.once("close", resolve))
  const outputFinished = finished(output, { cleanup: true }).then(
    () => ({ error: null }),
    (error: unknown) => ({ error: error instanceof Error ? error : new Error(String(error)) })
  )
  let workbook: StreamingWorkbook | undefined
  let worksheetInputs: ExcelJsWorksheetInputs | undefined
  let archiveClosed: Promise<void> | undefined
  let writeError: Error | undefined
  let fail: ((error: Error) => void) | undefined
  const onAbort = () => fail?.(signal?.reason instanceof Error ? signal.reason : new Error(String(signal?.reason)))
  try {
    // ExcelJS forwards this object to Archiver but omits Transform options in its types.
    const zipOptions = { highWaterMark: 65_536, zlib: { level: 6 } }
    workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
      stream: output, useStyles: true, useSharedStrings: false,
      // Bound both archive buffers as well as worksheet XML; Archiver's 1MiB
      // default per side lets a stalled file keep absorbing whole worksheet data.
      zip: zipOptions
    }) as StreamingWorkbook
    archiveClosed = new Promise<void>((resolve) => workbook?.zip.once("close", resolve))
    const failed = new Promise<Error>((resolveFailure) => {
      fail = (error: Error) => {
        if (writeError) return
        writeError = error
        worksheetInputs?.destroy(error)
        workbook?.zip.abort()
        workbook?.zip.destroy()
        output.destroy(error)
        resolveFailure(error)
      }
      output.once("error", fail)
      workbook?.zip.on("error", fail)
    })
    worksheetInputs = new ExcelJsWorksheetInputs(workbook, error => fail?.(error))
    // ExcelJS ignores this Promise; a late commit can finalize an aborted archive.
    const finalize = workbook.zip.finalize.bind(workbook.zip)
    workbook.zip.finalize = () => finalize().catch((error: unknown) => {
      fail?.(error instanceof Error ? error : new Error(String(error)))
    })
    signal?.addEventListener("abort", onAbort, { once: true })
    signal?.throwIfAborted()
    for (const snapshot of sheets) {
      signal?.throwIfAborted()
      if (snapshot.rowCount + 2 > 1_048_576) {
        throw new Error(`Excel worksheet row limit exceeded: ${snapshot.name}`)
      }
      const sheet = workbook.addWorksheet(snapshot.name, { views: [{ state: "frozen", ySplit: 2 }] })
      setSheetColumns(sheet, snapshot.columns, snapshot.rowCount)
      addHeaderRows(sheet, snapshot.columns)
      await worksheetInputs.drain(sheet.id)
      let count = 0
      for await (const row of readSnapshotRows(snapshot.path, snapshot.columns.headers.length, signal)) {
        signal?.throwIfAborted()
        if (writeError) throw writeError
        sheet.addRow(row.map((value, index) =>
          snapshot.columns.headers[index] === "protocol_version" && value !== null ? String(value) : value
        )).commit()
        // Bound worksheet input to its HWM plus one row/chunk, not arbitrary process RSS.
        await worksheetInputs.drain(sheet.id)
        count += 1
        // Let archive and filesystem writes progress without retaining all worksheet rows.
        if (count % 100 === 0) await setImmediate(undefined, { signal })
      }
      signal?.throwIfAborted()
      if (count !== snapshot.rowCount) throw new Error(`Incomplete export snapshot: ${snapshot.name}`)
      sheet.commit()
      // end() must happen before full Duplex completion; consume this table before the next.
      await worksheetInputs.consumed(sheet.id)
    }
    if (writeError) throw writeError
    await Promise.race([workbook.commit(), failed.then((error) => { throw error })])
    const result = await outputFinished
    await outputClosed
    signal?.throwIfAborted()
    if (result.error) throw result.error
  } catch (error) {
    const failure = error instanceof Error ? error : new Error(String(error))
    fail?.(failure)
    worksheetInputs?.destroy(failure)
    workbook?.zip.abort()
    workbook?.zip.destroy()
    output.destroy()
    await outputFinished
    await outputClosed
    await archiveClosed
    await worksheetInputs?.closed()
    await rm(path, { force: true })
    throw error
  } finally {
    signal?.removeEventListener("abort", onAbort)
  }
}

async function* readSnapshotRows(path: string, width: number, signal?: AbortSignal): AsyncIterable<ExportRow> {
  const file = await open(path, "r")
  const source = file.createReadStream({ autoClose: false, signal })
  const lines = createInterface({ input: source, crlfDelay: Infinity })
  try {
    for await (const line of lines) {
      signal?.throwIfAborted()
      const row: unknown = JSON.parse(line)
      if (!Array.isArray(row) || row.length !== width || !row.every(isCell)) {
        throw new Error("Invalid XLSX snapshot row.")
      }
      yield row
    }
  } finally {
    lines.close()
    source.destroy()
    await file.close()
  }
}

function isCell(value: unknown): value is string | number | boolean | null {
  return value === null || typeof value === "string" || typeof value === "boolean"
    || (typeof value === "number" && Number.isFinite(value))
}

function setSheetColumns(sheet: ExcelJS.Worksheet, columns: ExportColumns, rowCount: number): void {
  for (let index = 0; index < columns.headers.length; index += 1) {
    const field = columns.headers[index] ?? ""
    const comment = columns.comments[index] ?? ""
    const base = field.endsWith("_at") ? 30
      : field.endsWith("_id") || field.endsWith("_uid") || field === "event_key" ? 24
        : field === "message_text" ? 56 : field.includes("name") ? 24 : 18
    sheet.getColumn(index + 1).width = Math.max(base, Math.min(36, comment.length * 2))
  }
  sheet.autoFilter = `A1:${sheet.getColumn(columns.headers.length).letter}${rowCount + 2}`
}

function addHeaderRows(sheet: ExcelJS.Worksheet, columns: ExportColumns): void {
  const header = sheet.addRow([...columns.headers])
  header.font = { bold: true, color: { argb: "FFFFFFFF" } }
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F4E78" } }
  header.border = { bottom: { style: "thin" } }
  header.commit()
  const comments = sheet.addRow([...columns.comments])
  comments.font = { color: { argb: "FF1F4E78" } }
  comments.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9EAF7" } }
  comments.border = { bottom: { style: "thin" } }
  comments.height = 32
  comments.alignment = { wrapText: true }
  comments.commit()
}
