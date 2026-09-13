// Synthetic protocol fixtures only; no captured user transactions or credentials.
export const giftReceivedAt = "2026-09-13T04:16:00.000Z"

export function varint(value: bigint): Buffer {
  const bytes: number[] = []
  do {
    bytes.push(Number(value & 127n) | (value > 127n ? 128 : 0))
    value >>= 7n
  } while (value > 0n)
  return Buffer.from(bytes)
}

export function integerField(field: number, value: number | bigint): Buffer {
  return Buffer.concat([varint(BigInt(field * 8)), varint(BigInt(value))])
}

export function bytesField(field: number, value: string | Buffer): Buffer {
  const bytes = typeof value === "string" ? Buffer.from(value, "utf8") : value
  return Buffer.concat([varint(BigInt(field * 8 + 2)), varint(BigInt(bytes.length)), bytes])
}

export function giftItem(tid = "gift-1", quantity = 1, coin = "gold", total: number | null = 100): Buffer {
  return Buffer.concat([
    integerField(1, 31036), bytesField(2, "粉丝团灯牌"), integerField(3, quantity),
    integerField(5, 100), ...(total === null ? [] : [integerField(7, total)]),
    bytesField(8, coin), bytesField(9, tid), integerField(10, 1789272900)
  ])
}

export function giftEnvelope(items: Buffer[] = [giftItem()], uid = 166415666n): string {
  const pb = Buffer.concat([
    integerField(1, uid), bytesField(2, "测试用户"), bytesField(8, bytesField(6, "粉丝牌")),
    ...items.map(item => bytesField(10, item))
  ]).toString("base64")
  return JSON.stringify({ cmd: "SEND_GIFT_V2", data: { pb } })
}
