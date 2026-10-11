import { PassThrough, type Readable } from "node:stream"
import { finished } from "node:stream/promises"

import type ExcelJS from "exceljs"

// ExcelJS 4.4.0 internal API. Recheck worksheet paths/StringBuf/finish→zipped on upgrades.
export type StreamingWorkbook = ExcelJS.stream.xlsx.WorkbookWriter & {
  _openStream(path: string): unknown
  zip: Readable & {
    append(input: Readable, options: { name: string }): void
    abort(): void
    finalize(): Promise<void>
  }
}

type WriteCallback = (error: Error | null | undefined) => void

class WorksheetInput extends PassThrough {
  override write(chunk: unknown, callback?: WriteCallback): boolean
  override write(chunk: unknown, encoding: BufferEncoding, callback?: WriteCallback): boolean
  override write(chunk: unknown, encodingOrCallback?: BufferEncoding | WriteCallback, callback?: WriteCallback): boolean {
    // ExcelJS reuses module-level StringBuf objects: copy at entry, before any async queue.
    if (typeof chunk !== "string" && !Buffer.isBuffer(chunk)) {
      if (typeof chunk !== "object" || chunk === null || !("toBuffer" in chunk)
        || typeof chunk.toBuffer !== "function") throw new TypeError("Unknown ExcelJS worksheet XML chunk")
      const buffer: unknown = chunk.toBuffer()
      if (!Buffer.isBuffer(buffer)) throw new TypeError("Invalid ExcelJS StringBuf buffer")
      chunk = buffer
    }
    if (typeof encodingOrCallback === "string") return super.write(chunk, encodingOrCallback, callback)
    return super.write(chunk, encodingOrCallback)
  }
}

interface WorksheetEntry {
  stream: WorksheetInput
  completed: Promise<Error | null>
  closed: Promise<void>
}

export class ExcelJsWorksheetInputs {
  private readonly entries = new Map<string, WorksheetEntry>()

  constructor(workbook: StreamingWorkbook, private readonly fail: (error: Error) => void) {
    const originalOpenStream = workbook._openStream.bind(workbook)
    workbook._openStream = (path: string) => {
      // Current scalar exports do not create notes/rels; leave those library paths alone.
      if (!/^\/xl\/worksheets\/sheet[1-9]\d*\.xml$/.test(path)) return originalOpenStream(path)
      const stream = new WorksheetInput({ readableHighWaterMark: 65_536, writableHighWaterMark: 65_536 })
      const closed = new Promise<void>(resolve => stream.once("close", resolve))
      const completed = finished(stream, { cleanup: true }).then(
        () => null,
        (error: unknown) => error instanceof Error ? error : new Error(String(error))
      )
      stream.on("error", this.fail)
      stream.on("finish", () => stream.emit("zipped"))
      this.entries.set(path, { stream, completed, closed })
      workbook.zip.append(stream, { name: path })
      return stream
    }
  }

  async drain(sheetId: number): Promise<void> {
    const { stream } = this.entry(sheetId)
    if (stream.destroyed) throw stream.errored ?? new Error("XLSX worksheet input closed")
    if (!stream.writableNeedDrain) return
    await new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        stream.removeListener("drain", onDrain)
        stream.removeListener("error", onError)
        stream.removeListener("close", onClose)
      }
      const onDrain = () => { cleanup(); resolve() }
      const onError = (error: Error) => { cleanup(); reject(error) }
      const onClose = () => onError(stream.errored ?? new Error("XLSX worksheet input closed before drain"))
      stream.once("drain", onDrain)
      stream.once("error", onError)
      stream.once("close", onClose)
    })
  }

  async consumed(sheetId: number): Promise<void> {
    const error = await this.entry(sheetId).completed
    if (error) throw error
  }

  destroy(error: Error): void {
    for (const { stream } of this.entries.values()) stream.destroy(error)
  }

  async closed(): Promise<void> {
    await Promise.all([...this.entries.values()].map(entry => entry.closed))
  }

  private entry(sheetId: number): WorksheetEntry {
    const entry = this.entries.get(`/xl/worksheets/sheet${sheetId}.xml`)
    if (!entry) throw new Error("Missing ExcelJS worksheet input")
    return entry
  }
}
