// Matches the original B/S GiftV2Decoder field map. Unknown fields are skipped.
type Field = { number: number; value: bigint | Buffer }

export function decodeBilibiliGiftV2(encoded: string): Record<string, unknown>[] {
  if (!encoded || encoded.length > 2_000_000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) {
    throw new Error("Invalid gift protobuf encoding or size")
  }
  const bytes = Buffer.from(encoded, "base64")
  if (bytes.toString("base64").replace(/=+$/, "") !== encoded.replace(/=+$/, "")) {
    throw new Error("Invalid gift protobuf base64")
  }
  const sender: Record<string, unknown> = {}
  const gifts: Record<string, unknown>[] = []
  for (const field of fields(bytes)) {
    if (field.number === 1) sender.uid = integer(field).toString()
    else if (field.number === 2) sender.uname = payload(field).toString("utf8")
    else if (field.number === 8) {
      for (const medal of fields(payload(field))) {
        if (medal.number === 6) sender.medal_info = { medal_name: payload(medal).toString("utf8") }
      }
    } else if (field.number === 10) gifts.push(decodeGift(payload(field)))
  }
  if (gifts.length === 0) throw new Error("Empty gift protobuf list")
  return gifts.map(gift => ({ ...gift, ...sender }))
}

function decodeGift(bytes: Buffer): Record<string, unknown> {
  const gift: Record<string, unknown> = {}
  const textFields: Record<number, string> = { 2: "giftName", 8: "coin_type", 9: "tid", 12: "rnd" }
  const numericFields: Record<number, string> = { 3: "num", 5: "price", 7: "total_coin", 10: "timestamp" }
  for (const field of fields(bytes)) {
    const textKey = textFields[field.number]
    const numericKey = numericFields[field.number]
    if (field.number === 1) gift.giftId = integer(field).toString()
    else if (textKey) gift[textKey] = payload(field).toString("utf8")
    else if (numericKey) {
      const value = integer(field)
      if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("Unsafe gift integer")
      gift[numericKey] = Number(value)
    }
  }
  if (typeof gift.giftId !== "string" || gift.giftId === "0"
      || typeof gift.num !== "number" || gift.num < 1 || gift.num > 2147483647) {
    throw new Error("Invalid gift identity or quantity")
  }
  if (gift.total_coin === undefined && typeof gift.price === "number"
      && !Number.isSafeInteger(gift.price * gift.num)) throw new Error("Unsafe gift total")
  return gift
}

function* fields(bytes: Buffer): Generator<Field> {
  let offset = 0
  const readVarint = (): bigint => {
    let value = 0n
    for (let index = 0; index < 10; index += 1) {
      const next = bytes[offset++]
      if (next === undefined) throw new Error("Truncated protobuf varint")
      if (index === 9 && (next & 0xfe) !== 0) throw new Error("Protobuf varint overflow")
      value |= BigInt(next & 0x7f) << BigInt(index * 7)
      if ((next & 0x80) === 0) return value
    }
    throw new Error("Invalid protobuf varint")
  }
  const readBytes = (length: bigint): Buffer => {
    if (length > BigInt(bytes.length - offset)) throw new Error("Truncated protobuf field")
    const result = bytes.subarray(offset, offset + Number(length))
    offset += Number(length)
    return result
  }
  while (offset < bytes.length) {
    const tag = readVarint()
    const number = Number(tag >> 3n)
    if (number < 1 || number > 0x1fffffff) throw new Error("Invalid protobuf tag")
    switch (Number(tag & 7n)) {
      case 0: yield { number, value: readVarint() }; break
      case 1: readBytes(8n); break
      case 2: yield { number, value: readBytes(readVarint()) }; break
      case 5: readBytes(4n); break
      default: throw new Error("Unsupported protobuf wire type")
    }
  }
}

function integer(field: Field): bigint {
  if (typeof field.value !== "bigint") throw new Error("Invalid protobuf integer wire type")
  return field.value
}

function payload(field: Field): Buffer {
  if (typeof field.value === "bigint") throw new Error("Invalid protobuf bytes wire type")
  return field.value
}
