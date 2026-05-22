import fs from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";

export type BridgeInfo = {
  version: number;
  host: string;
  port: number;
  sharedRingPath: string;
  sharedRingEnabled: boolean;
  sharedRingDropped: number;
  sharedRingWriteSeq: number;
  degradedSharedMemory: boolean;
  generatedAt: number;
};

export type BridgeResponse = {
  requestId: number;
  accepted: boolean;
  payload?: string;
  opId?: number;
  cursor?: string;
  errorCode?: number;
  errorName?: string;
  message?: string;
};

type Pending = {
  resolve: (value: BridgeResponse) => void;
  reject: (reason?: unknown) => void;
  timeout: NodeJS.Timeout;
};

type EventMessage = {
  eventType: string;
  payload?: string;
  eventSeq?: number;
  dropped?: number;
};

const TYPE_STRING = 1;
const TYPE_INT = 2;
const TYPE_LONG = 3;
const TYPE_BOOL = 4;

export class MindustryBridgeClient {
  private socket: net.Socket | null = null;
  private buffer = Buffer.alloc(0);
  private requestId = 1;
  private pending = new Map<number, Pending>();
  private lastDropped = 0;

  readonly bridgeDir = path.join(os.tmpdir(), "mindustryx-ai-bridge");
  readonly bridgeInfoPath = path.join(this.bridgeDir, "bridge-info.json");

  async loadBridgeInfo(): Promise<BridgeInfo> {
    const raw = await fs.readFile(this.bridgeInfoPath, "utf8");
    return JSON.parse(raw) as BridgeInfo;
  }

  async connect(): Promise<void> {
    if (this.socket && !this.socket.destroyed) return;

    const info = await this.loadBridgeInfo();

    await new Promise<void>((resolve, reject) => {
      const socket = net.createConnection({ host: info.host, port: info.port }, () => {
        this.socket = socket;
        resolve();
      });

      socket.on("data", (chunk) => this.handleData(chunk));
      socket.on("error", (error) => {
        this.rejectAll(error);
        reject(error);
      });
      socket.on("close", () => {
        this.rejectAll(new Error("Bridge socket closed"));
        this.socket = null;
      });
    });
  }

  async close(): Promise<void> {
    const socket = this.socket;
    this.socket = null;
    this.rejectAll(new Error("Bridge client closed"));
    if (!socket) return;

    await new Promise<void>((resolve) => {
      socket.once("close", () => resolve());
      socket.destroy();
    });
  }

  async request(op: string, payload: Record<string, unknown> = {}, timeoutMs = 5000): Promise<BridgeResponse> {
    await this.connect();

    const requestId = this.requestId++;
    const frame = encodeMessage({
      kind: "request",
      requestId,
      op,
      payload: JSON.stringify(payload)
    });

    const socket = this.socket;
    if (!socket) {
      throw new Error("Bridge socket unavailable");
    }

    const response = await new Promise<BridgeResponse>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error(`Bridge request timed out: ${op}`));
      }, timeoutMs);

      this.pending.set(requestId, { resolve, reject, timeout });
      socket.write(frame);
    });

    if (!response.accepted && response.errorName) {
      throw new Error(`${response.errorName}: ${response.message ?? "bridge error"}`);
    }
    return response;
  }

  async requestAllPages(op: string, payload: Record<string, unknown> = {}, timeoutMs = 5000): Promise<string> {
    const first = await this.request(op, payload, timeoutMs);
    let result = first.payload ?? "";
    let cursor = first.cursor;
    let index = 1;

    while (cursor) {
      const next = await this.request("cursor_next", { cursor, index }, timeoutMs);
      result += next.payload ?? "";
      cursor = next.cursor;
      index += 1;
    }

    return result;
  }

  async awaitOp(opId: number, timeoutMs = 5000): Promise<BridgeResponse> {
    return await this.request("await", { opId, timeoutMs }, timeoutMs + 250);
  }

  async getBridgeStatus(): Promise<BridgeInfo & { droppedDelta: number }> {
    const info = await this.loadBridgeInfo();
    const droppedDelta = Math.max(0, info.sharedRingDropped - this.lastDropped);
    this.lastDropped = info.sharedRingDropped;
    return { ...info, droppedDelta };
  }

  private handleData(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);

    while (this.buffer.length >= 4) {
      const frameSize = this.buffer.readInt32BE(0);
      if (this.buffer.length < 4 + frameSize) return;

      const frame = this.buffer.subarray(4, 4 + frameSize);
      this.buffer = this.buffer.subarray(4 + frameSize);
      const message = decodeMessage(frame);

      if (message.kind === "response") {
        const pending = this.pending.get(message.requestId);
        if (!pending) continue;
        clearTimeout(pending.timeout);
        this.pending.delete(message.requestId);
        pending.resolve(message);
      } else if (message.kind === "event") {
        const event = message as EventMessage;
        if (typeof event.dropped === "number") {
          this.lastDropped = Math.max(this.lastDropped, event.dropped);
        }
      }
    }
  }

  private rejectAll(error: unknown): void {
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timeout);
      pending.reject(error);
      this.pending.delete(id);
    }
  }
}

type WireMessage = {
  kind?: string;
  requestId?: number;
  op?: string;
  payload?: string;
  accepted?: boolean;
  opId?: number;
  cursor?: string;
  errorCode?: number;
  errorName?: string;
  message?: string;
  eventType?: string;
  eventSeq?: number;
  dropped?: number;
};

function encodeMessage(message: WireMessage): Buffer {
  const fields: Buffer[] = [];

  pushString(fields, 1, message.kind);
  pushLong(fields, 2, message.requestId);
  pushString(fields, 3, message.op);
  pushString(fields, 4, message.payload);
  pushBool(fields, 5, message.accepted);
  pushLong(fields, 6, message.opId);
  pushString(fields, 7, message.cursor);
  pushInt(fields, 8, message.errorCode);
  pushString(fields, 9, message.errorName);
  pushString(fields, 10, message.message);
  pushString(fields, 11, message.eventType);
  pushLong(fields, 12, message.eventSeq);
  pushLong(fields, 13, message.dropped);

  const body = Buffer.concat(fields);
  const frame = Buffer.alloc(4 + body.length);
  frame.writeInt32BE(body.length, 0);
  body.copy(frame, 4);
  return frame;
}

function decodeMessage(buffer: Buffer): BridgeResponse & EventMessage & { kind?: string; op?: string } {
  const out: BridgeResponse & EventMessage & { kind?: string; op?: string } = {
    requestId: 0,
    accepted: false,
    eventType: ""
  };

  let offset = 0;
  while (offset < buffer.length) {
    const tag = buffer.readInt32BE(offset);
    offset += 4;
    const type = buffer.readUInt8(offset);
    offset += 1;
    const length = buffer.readInt32BE(offset);
    offset += 4;
    const value = buffer.subarray(offset, offset + length);
    offset += length;

    switch (tag) {
      case 1:
        out.kind = readString(type, value);
        break;
      case 2:
        out.requestId = Number(readLong(type, value));
        break;
      case 3:
        out.op = readString(type, value);
        break;
      case 4:
        out.payload = readString(type, value);
        break;
      case 5:
        out.accepted = readBool(type, value);
        break;
      case 6:
        out.opId = Number(readLong(type, value));
        break;
      case 7:
        out.cursor = readString(type, value);
        break;
      case 8:
        out.errorCode = readInt(type, value);
        break;
      case 9:
        out.errorName = readString(type, value);
        break;
      case 10:
        out.message = readString(type, value);
        break;
      case 11:
        out.eventType = readString(type, value);
        break;
      case 12:
        out.eventSeq = Number(readLong(type, value));
        break;
      case 13:
        out.dropped = Number(readLong(type, value));
        break;
      default:
        break;
    }
  }

  return out;
}

function pushField(out: Buffer[], tag: number, type: number, value: Buffer): void {
  const field = Buffer.alloc(9);
  field.writeInt32BE(tag, 0);
  field.writeUInt8(type, 4);
  field.writeInt32BE(value.length, 5);
  out.push(field, value);
}

function pushString(out: Buffer[], tag: number, value: string | undefined): void {
  if (value == null) return;
  pushField(out, tag, TYPE_STRING, Buffer.from(value, "utf8"));
}

function pushInt(out: Buffer[], tag: number, value: number | undefined): void {
  if (value == null) return;
  const buf = Buffer.alloc(4);
  buf.writeInt32BE(value, 0);
  pushField(out, tag, TYPE_INT, buf);
}

function pushLong(out: Buffer[], tag: number, value: number | undefined): void {
  if (value == null) return;
  const buf = Buffer.alloc(8);
  buf.writeBigInt64BE(BigInt(value), 0);
  pushField(out, tag, TYPE_LONG, buf);
}

function pushBool(out: Buffer[], tag: number, value: boolean | undefined): void {
  if (value == null) return;
  pushField(out, tag, TYPE_BOOL, Buffer.from([value ? 1 : 0]));
}

function readString(type: number, value: Buffer): string {
  if (type !== TYPE_STRING) throw new Error(`Expected string, got ${type}`);
  return value.toString("utf8");
}

function readInt(type: number, value: Buffer): number {
  if (type !== TYPE_INT || value.length !== 4) throw new Error("Expected int field");
  return value.readInt32BE(0);
}

function readLong(type: number, value: Buffer): bigint {
  if (type !== TYPE_LONG || value.length !== 8) throw new Error("Expected long field");
  return value.readBigInt64BE(0);
}

function readBool(type: number, value: Buffer): boolean {
  if (type !== TYPE_BOOL || value.length !== 1) throw new Error("Expected bool field");
  return value[0] !== 0;
}
