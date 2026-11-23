import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { webcrypto } from "node:crypto";
import { DeviceConnection } from "../web/serial-client.mjs";
import { SPRITE_PACK, parseSpritePack, fetchSpritePack, loadAllSprites } from "../web/sprite-pack.mjs";

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const actual = new Uint8Array(await readFile(new URL("../web/assets/sprites/all-gen1.pak", import.meta.url)));

class SDPort {
  constructor(options = {}) {
    this.options = { sd: true, total: 128 * 1024 * 1024, used: 0, ...options };
    this.commands = [];
    this.blocks = [];
    this.files = new Map();
    this.completed = 0;
    this.listCalls = 0;
  }
  getInfo() { return { usbVendorId: 0x303a }; }
  async open() {
    this.readable = new ReadableStream({ start: (controller) => { this.controller = controller; } });
    this.writable = new WritableStream({ write: (data) => this.receive(data) });
  }
  async setSignals() {}
  async close() { this.closed = true; }
  reply(text) {
    // USB can split every line across packets, including both ACK and DONE.
    const data = encoder.encode(text);
    for (let at = 0; at < data.length; at += 3) this.controller.enqueue(data.slice(at, at + 3));
  }
  receive(data) {
    if (this.current) {
      this.blocks.push(data.length);
      this.current.parts.push(data.slice());
      this.current.remaining -= data.length;
      if (this.options.failBlock) { this.current = null; this.reply("ERR\n"); return; }
      if (this.options.silentBlock) return;
      this.reply("#\n");
      if (this.current.remaining === 0) {
        const bytes = new Uint8Array(this.current.size);
        let offset = 0;
        for (const part of this.current.parts) { bytes.set(part, offset); offset += part.length; }
        this.files.set(this.current.name, bytes);
        this.completed++;
        this.current = null;
        this.reply("DONE\n");
      }
      return;
    }
    const command = decoder.decode(data).trim();
    this.commands.push(command);
    if (command === "HEALTH") this.reply(this.options.wrongFirmware ? "unrelated\nDONE\n" : `up=4s heap=293912 sd=${Number(this.options.sd)} mon=1\nDONE\n`);
    else if (command === "STATS") this.reply("spec=25 nv=1 sd=1 mon=0\nDONE\n");
    else if (command === "SDINFO") this.reply(`total=${this.options.total} used=${this.options.used}\nDONE\n`);
    else if (command === "LS") {
      this.listCalls++;
      this.reply([...this.files].map(([name, data]) => `${name.split("/").at(-1)} ${data.length + (this.options.corruptListing ? 1 : 0)}\n`).join("") + "DONE\n");
    } else if (command.startsWith("PUT ")) {
      const [, name, size] = command.split(" ");
      this.current = { name, size: Number(size), remaining: Number(size), parts: [] };
      this.reply("OK\n");
    } else throw new Error("Unexpected command: " + command);
  }
}

function smallItems() {
  return parseSpritePack(actual.buffer).map((item, index) => ({
    name: item.name,
    data: new Uint8Array(index === 0 ? 5000 : 1).fill(index % 256),
  }));
}
const setup = (port, options = {}) => ({ serialApi: { getPorts: async () => [port] }, getPack: async () => smallItems(), timeout: 100, ...options });

test("official bundle contains every normal and shiny species plus thumbnails", () => {
  const items = parseSpritePack(actual.buffer);
  assert.equal(items.length, 303);
  assert.equal(items.reduce((sum, item) => sum + item.size, 0), SPRITE_PACK.payloadBytes);
  assert.equal(new Set(items.map((item) => item.name)).size, 303);
  assert.ok(items.some((item) => item.name === "mons/p151.bin"));
  assert.ok(items.some((item) => item.name === "mons/ps151.bin"));
});

test("truncated bundle and duplicate or unsafe names cannot reach the board", () => {
  assert.throws(() => parseSpritePack(actual.slice(0, -1).buffer), /格式/);
  const malformed = actual.slice();
  malformed.set(encoder.encode("../bad/"), 7);
  assert.throws(() => parseSpritePack(malformed.buffer), /格式/);
  const extra = new Uint8Array(actual.length + 1); extra.set(actual);
  assert.throws(() => parseSpritePack(extra.buffer), /格式/);
});

test("download is accepted only with the archived SHA-256", async () => {
  const result = await fetchSpritePack({ fetchApi: async () => ({ ok: true, arrayBuffer: async () => actual.buffer }), cryptoApi: webcrypto });
  assert.equal(result.length, 303);
  const changed = actual.slice(); changed[changed.length - 1] ^= 1;
  await assert.rejects(fetchSpritePack({ fetchApi: async () => ({ ok: true, arrayBuffer: async () => changed.buffer }), cryptoApi: webcrypto }), /校驗失敗/);
});

test("PUT waits for each ACK, preserves bytes across 2048-byte boundaries and releases locks", async () => {
  const port = new SDPort(), connection = new DeviceConnection(port, { timeout: 100 });
  const bytes = new Uint8Array(5000).map((_, index) => index % 251);
  await connection.open();
  await connection.put("mons/p025.bin", bytes);
  assert.deepEqual(port.blocks, [2048, 2048, 904]);
  assert.deepEqual(port.files.get("mons/p025.bin"), bytes);
  await connection.close();
  assert.equal(port.readable.locked, false);
  assert.equal(port.writable.locked, false);
});

test("PUT rejects paths outside sprite storage before sending anything", async () => {
  const port = new SDPort(), connection = new DeviceConnection(port);
  await connection.open();
  await assert.rejects(connection.put("mons/../save.bin", new Uint8Array([1])), /名稱/);
  assert.deepEqual(port.commands, []);
  await connection.close();
});

test("missing microSD stops before any bundle download or PUT and preserves the pet", async () => {
  const port = new SDPort({ sd: false }); let downloads = 0;
  await assert.rejects(loadAllSprites(setup(port, { getPack: async () => { downloads++; return smallItems(); } })), /沒有讀到 microSD/);
  assert.equal(downloads, 0);
  assert.deepEqual(port.commands, ["HEALTH", "STATS"]);
  assert.equal(port.closed, true);
});

test("unrelated firmware never receives storage writes", async () => {
  const port = new SDPort({ wrongFirmware: true });
  await assert.rejects(loadAllSprites(setup(port)), /沒有回覆 TamaPoke/);
  assert.deepEqual(port.commands, ["HEALTH", "STATS"]);
});

test("insufficient space stops before download and before replacing any file", async () => {
  const port = new SDPort({ total: 16 * 1024 * 1024 }); let downloads = 0;
  await assert.rejects(loadAllSprites(setup(port, { getPack: async () => { downloads++; return smallItems(); } })), /空間不足/);
  assert.equal(downloads, 0);
  assert.equal(port.completed, 0);
  assert.equal(port.closed, true);
});

test("all 303 ACK-confirmed files are listed and sized, without changing character, clock or save", async () => {
  const port = new SDPort(), progress = [];
  const result = await loadAllSprites(setup(port, { onProgress: (value) => progress.push(value) }));
  assert.equal(result.files, 303);
  assert.equal(result.listingVerified, true);
  assert.equal(port.listCalls, 2);
  assert.equal(port.commands.filter((command) => command.startsWith("PUT ")).length, 303);
  assert.ok(port.commands.every((command) => !/^(SPEC|WIPE|LVL|TIME)\b/.test(command)));
  assert.equal(progress.at(-1).files, 303);
  assert.equal(progress.at(-1).bytes, result.bytes);
  for (const item of smallItems()) assert.deepEqual(port.files.get(item.name), item.data);
  assert.equal(port.closed, true);
});

test("Stop completes the current binary file and sends no next file", async () => {
  const port = new SDPort(), controller = new AbortController();
  await assert.rejects(loadAllSprites(setup(port, {
    signal: controller.signal,
    onProgress: () => controller.abort(),
  })), { name: "AbortError" });
  assert.equal(port.completed, 1);
  assert.equal(port.current, null);
  assert.deepEqual(port.blocks, [2048, 2048, 904]);
  assert.equal(port.closed, true);
});

test("a rejected write stops the batch and does not send commands into remaining binary bytes", async () => {
  const port = new SDPort({ failBlock: true });
  await assert.rejects(loadAllSprites(setup(port)), /寫入失敗/);
  assert.equal(port.commands.filter((command) => command.startsWith("PUT ")).length, 1);
  assert.equal(port.blocks.length, 1);
  assert.equal(port.closed, true);
});

test("a lost ACK times out and closes the USB connection", async () => {
  const port = new SDPort({ silentBlock: true });
  await assert.rejects(loadAllSprites(setup(port, { timeout: 30 })), /沒有回覆/);
  assert.equal(port.blocks.length, 1);
  assert.equal(port.commands.filter((command) => command === "LS").length, 1);
  assert.equal(port.closed, true);
});

test("wrong final SD file sizes cannot produce a success result", async () => {
  const port = new SDPort({ corruptListing: true });
  await assert.rejects(loadAllSprites(setup(port)), /檔案核對未通過/);
  assert.equal(port.completed, 303);
  assert.equal(port.closed, true);
});
