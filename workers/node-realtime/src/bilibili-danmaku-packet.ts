import { brotliDecompressSync, inflateSync } from "node:zlib"

export const BILIBILI_DANMAKU_OPERATION = {
  HEARTBEAT: 2,
  HEARTBEAT_REPLY: 3,
  COMMAND: 5,
  AUTH: 7,
  AUTH_REPLY: 8
} as const

const HEADER_LENGTH = 16

export interface BilibiliDanmakuAuthPacketInput {
  roomId: string
  uid?: string | undefined
  token: string
  buvid?: string
  clientVersion?: string
  protocolVersion: number
}

export interface ParsedBilibiliDanmakuPacket {
  protocolVersion: number
  operation: number
  sequence: number
  bodyText?: string
  popularity?: number
}

export function buildBilibiliDanmakuAuthPacket(
  input: BilibiliDanmakuAuthPacketInput
): Buffer {
  return buildPacket(BILIBILI_DANMAKU_OPERATION.AUTH, Buffer.from(JSON.stringify({
    uid: safeNumericValue(input.uid),
    roomid: safeNumericValue(input.roomId),
    protover: normalizeProtocolVersion(input.protocolVersion),
    platform: "web",
    type: 2,
    key: input.token,
    buvid: input.buvid ?? "",
    clientver: input.clientVersion?.trim() || "1.14.3"
  })))
}

export function buildBilibiliDanmakuHeartbeatPacket(): Buffer {
  return buildPacket(
    BILIBILI_DANMAKU_OPERATION.HEARTBEAT,
    Buffer.from("[object Object]", "utf8")
  )
}

export function parseBilibiliDanmakuPackets(bytes: Buffer): ParsedBilibiliDanmakuPacket[] {
  const packets: ParsedBilibiliDanmakuPacket[] = []
  parseInto(bytes, packets)
  return packets
}

function buildPacket(operation: number, body: Buffer): Buffer {
  const packet = Buffer.alloc(HEADER_LENGTH + body.length)
  packet.writeUInt32BE(packet.length, 0)
  packet.writeUInt16BE(HEADER_LENGTH, 4)
  packet.writeUInt16BE(1, 6)
  packet.writeUInt32BE(operation, 8)
  packet.writeUInt32BE(1, 12)
  body.copy(packet, HEADER_LENGTH)
  return packet
}

function parseInto(bytes: Buffer, packets: ParsedBilibiliDanmakuPacket[]): void {
  let offset = 0
  while (offset + HEADER_LENGTH <= bytes.length) {
    const packetLength = bytes.readUInt32BE(offset)
    const headerLength = bytes.readUInt16BE(offset + 4)
    const protocolVersion = bytes.readUInt16BE(offset + 6)
    const operation = bytes.readUInt32BE(offset + 8)
    const sequence = bytes.readUInt32BE(offset + 12)
    if (
      packetLength < headerLength
      || headerLength < HEADER_LENGTH
      || packetLength > bytes.length - offset
    ) return
    const body = bytes.subarray(offset + headerLength, offset + packetLength)
    if (operation === BILIBILI_DANMAKU_OPERATION.COMMAND && (protocolVersion === 2 || protocolVersion === 3)) {
      try {
        const inflated = protocolVersion === 2 ? inflateSync(body) : brotliDecompressSync(body)
        if (inflated.length >= HEADER_LENGTH) parseInto(inflated, packets)
        else if (inflated.length > 0) {
          packets.push({
            protocolVersion,
            operation,
            sequence,
            bodyText: inflated.toString("utf8")
          })
        }
      } catch {
        // A corrupt compressed frame is ignored; the connection remains available for later packets.
      }
    } else if (operation === BILIBILI_DANMAKU_OPERATION.HEARTBEAT_REPLY && body.length >= 4) {
      packets.push({
        protocolVersion,
        operation,
        sequence,
        popularity: body.readUInt32BE(0)
      })
    } else {
      packets.push({
        protocolVersion,
        operation,
        sequence,
        ...(body.length > 0 ? { bodyText: body.toString("utf8") } : {})
      })
    }
    offset += packetLength
  }
}

function normalizeProtocolVersion(value: number): number {
  return Number.isInteger(value) && value >= 0 && value <= 3 ? value : 3
}

function safeNumericValue(value: string | undefined): number {
  if (!value || !/^[0-9]+$/.test(value)) return 0
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0
}
