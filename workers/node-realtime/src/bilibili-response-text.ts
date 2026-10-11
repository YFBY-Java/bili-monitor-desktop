import type { IncomingHttpHeaders } from "node:http"
import { javaDoubleLiteral } from "./bilibili-java-double"

const TOKEN = /^[!#$%&'*+\-.0-9A-Z^_`a-z|~]+$/u
const CHARSET = /^[A-Za-z0-9][A-Za-z0-9.+:_-]*$/u
const JAVA_DOUBLE = /^[+-]?(?:NaN|Infinity|(?:(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?|0[xX](?:[0-9a-fA-F]+\.?[0-9a-fA-F]*|\.[0-9a-fA-F]+)[pP][+-]?[0-9]+)[fFdD]?)$/u
type Decoder = (body: Buffer) => string

function conversionError(): Error & { code: string; retryable: false } {
  // Header values and response bodies must never enter Worker diagnostics.
  return Object.assign(new Error("Unable to convert Bilibili response content type or charset."),
    { code: "BILIBILI_RESPONSE_CONVERSION_ERROR", retryable: false as const })
}

function javaTrim(value: string): string {
  return value.replace(/^[\x00-\x20]+|[\x00-\x20]+$/gu, "")
}

function unquote(value: string): string {
  return value.length >= 2 && ((value.startsWith('"') && value.endsWith('"'))
    || (value.startsWith("'") && value.endsWith("'"))) ? value.slice(1, -1) : value
}

function quality(value: string): number {
  const text = javaTrim(unquote(value))
  if (!JAVA_DOUBLE.test(text)) throw conversionError()
  const literal = text.replace(/[fFdD]$/u, "")
  return javaDoubleLiteral(literal)
}

function decoderFor(label: string): Decoder {
  if (!CHARSET.test(label) || label.toLowerCase() === "utf_8") throw conversionError()
  const normalized = label.toLowerCase()
  if (["iso-8859-1", "iso8859-1", "iso8859_1", "iso_8859-1", "iso_8859-1:1987", "iso88591",
    "latin1", "l1", "csisolatin1", "iso-ir-100", "cp819", "ibm819"].includes(normalized)) {
    // WHATWG TextDecoder maps Latin-1 to Windows-1252, unlike Java String.
    return body => body.toString("latin1")
  }
  if (["ascii", "us-ascii", "iso646-us", "ansi_x3.4-1968"].includes(normalized)) {
    return body => body.toString("latin1").replace(/[\x80-\xFF]/gu, "\uFFFD")
  }
  if (["utf-8", "utf8", "unicode-1-1-utf-8"].includes(normalized)) {
    return body => Buffer.from(body.toString("latin1").replace(/\xED[\xA0-\xBF][\x80-\xBF]?/gu,
      "\xEF\xBF\xBD"), "latin1").toString("utf8")
  }
  if (["utf-16", "utf16", "unicode"].includes(normalized)) {
    return body => {
      const little = body[0] === 0xff && body[1] === 0xfe
      const big = body[0] === 0xfe && body[1] === 0xff
      return new TextDecoder(little ? "utf-16le" : "utf-16be", { ignoreBOM: true })
        .decode(little || big ? body.subarray(2) : body)
    }
  }
  try {
    const decoder = new TextDecoder(label, { ignoreBOM: true })
    return body => decoder.decode(body)
  } catch { throw conversionError() }
}

export function bilibiliStringDecoder(headers: IncomingHttpHeaders): Decoder {
  const values = headers["content-type"]
  const media = Array.isArray(values) ? values[0] : values
  if (!media) return decoderFor("iso-8859-1")
  const semicolon = media.indexOf(";")
  let fullType = javaTrim(semicolon < 0 ? media : media.slice(0, semicolon))
  if (fullType === "*") fullType = "*/*"
  const [primary, subtype, extra] = fullType.split("/")
  if (!primary || !subtype || extra !== undefined || !TOKEN.test(primary) || !TOKEN.test(subtype)
    || (primary === "*" && subtype !== "*")) throw conversionError()
  const remainder = semicolon < 0 ? "" : media.slice(semicolon + 1)
  const parameters = new Map<string, string>()
  let start = 0, quoted = false
  for (let index = 0; index <= remainder.length; index++) {
    const character = remainder[index]
    if (character === '"') quoted = !quoted
    if (index < remainder.length && (character !== ";" || quoted)) continue
    const parameter = javaTrim(remainder.slice(start, index)), equals = parameter.indexOf("=")
    start = index + 1
    if (equals >= 0) parameters.set(javaTrim(parameter.slice(0, equals)), javaTrim(parameter.slice(equals + 1)))
  }
  let decoder: Decoder | undefined
  for (const [attribute, value] of parameters) {
    if (!TOKEN.test(attribute) || !value) throw conversionError()
    if (attribute === "charset") decoder = decoderFor(unquote(value))
    else if (unquote(value) === value && !TOKEN.test(value)) throw conversionError()
    if (attribute === "q") {
      const number = quality(value)
      if (!(number >= 0 && number <= 1)) throw conversionError()
    }
  }
  const json = ["application", "*"].includes(primary.toLowerCase())
    && (["json", "*"].includes(subtype.toLowerCase()) || subtype.toLowerCase().endsWith("+json"))
  return decoder ?? decoderFor(json ? "utf-8" : "iso-8859-1")
}
