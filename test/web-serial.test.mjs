import test from "node:test";
import assert from "node:assert/strict";
import { activatePikachu, localClockEpoch, DeviceConnection } from "../web/serial-client.mjs";

class FakePort {
  constructor({ wrongFirmware = false, silent = false, failSignals = false } = {}) {
    this.commands = [];
    this.closed = false;
    this.species = -1;
    this.failSignals = failSignals;
    this.responses = (command) => {
      if (silent) return null;
      if (wrongFirmware) return "unrelated firmware\nDONE\n";
      if (command === "HEALTH") return `up=3s heap=293776 sd=0 mon=${this.species === 25 ? 1 : 0}\nDONE\n`;
      if (command === "STATS") return `spec=${this.species} nv=1 sd=0 mon=0\nDONE\n`;
      if (command === "SPEC 25") { this.species = 25; return "especie #25 PIKACHU\nDONE\n"; }
      if (command.startsWith("TIME ")) return "rtc=1795432800\nDONE\n";
      return "ERR\n";
    };
  }
  async open(options) {
    this.options = options;
    this.readable = new ReadableStream({ start: (controller) => { this.controller = controller; } });
    this.writable = new WritableStream({ write: (bytes) => {
      const command = new TextDecoder().decode(bytes).trim();
      this.commands.push(command);
      const reply = this.responses(command);
      // Real USB packets can divide a response in the middle of any line.
      if (reply) for (let i = 0; i < reply.length; i += 7) this.controller.enqueue(new TextEncoder().encode(reply.slice(i, i + 7)));
    } });
  }
  async setSignals(signals) {
    if (this.failSignals) throw new Error("signal failure");
    this.signals = signals;
  }
  async close() { this.closed = true; }
  getInfo() { return { usbVendorId: this.vendorId ?? 0x303a }; }
}

test("activation reuses the one already authorized Espressif board without another chooser", async () => {
  const port = new FakePort();
  let chooserCalls = 0;
  const result = await activatePikachu({ serialApi: {
    getPorts: async () => [port],
    requestPort: async () => { chooserCalls++; throw new Error("Should reuse permission"); },
  }, timeout: 150 });
  assert.equal(result.species, 25);
  assert.equal(chooserCalls, 0);
  assert.equal(port.closed, true);
});

test("more than one authorized board still requires the visitor to choose", async () => {
  const first = new FakePort(), selected = new FakePort();
  let chooserCalls = 0;
  await activatePikachu({ serialApi: {
    getPorts: async () => [first, selected],
    requestPort: async () => { chooserCalls++; return selected; },
  }, timeout: 150 });
  assert.equal(chooserCalls, 1);
  assert.equal(first.commands.length, 0);
  assert.ok(selected.commands.includes("SPEC 25"));
});

test("an authorized device from another USB vendor is not selected automatically", async () => {
  const unrelated = new FakePort(), selected = new FakePort();
  unrelated.vendorId = 0x10c4;
  let chooserCalls = 0;
  await activatePikachu({ serialApi: {
    getPorts: async () => [unrelated],
    requestPort: async () => { chooserCalls++; return selected; },
  }, timeout: 150 });
  assert.equal(chooserCalls, 1);
  assert.equal(unrelated.commands.length, 0);
});

test("fresh starter screen becomes persisted Pikachu and loads its sprite", async () => {
  const port = new FakePort();
  const status = [];
  const result = await activatePikachu({ serialApi: { requestPort: async () => port }, onStatus: (text) => status.push(text), timeout: 150 });
  assert.deepEqual(result, { species: 25, spriteLoaded: true, clockSynced: true });
  assert.equal(port.commands[0], "HEALTH");
  assert.equal(port.commands[1], "STATS");
  assert.equal(port.commands[2], "SPEC 25");
  assert.match(port.commands[3], /^TIME \d+$/);
  assert.equal(port.signals.dataTerminalReady, true);
  assert.equal(port.closed, true);
  assert.match(status.at(-1), /完成/);
});

test("unrelated firmware receives no character or clock mutation", async () => {
  const port = new FakePort({ wrongFirmware: true });
  await assert.rejects(activatePikachu({ serialApi: { requestPort: async () => port }, timeout: 100 }), /沒有回覆 TamaPoke/);
  assert.deepEqual(port.commands, ["HEALTH", "STATS"]);
  assert.equal(port.closed, true);
});

test("a stalled board times out and releases both USB stream locks", async () => {
  const port = new FakePort({ silent: true });
  await assert.rejects(activatePikachu({ serialApi: { requestPort: async () => port }, timeout: 40 }), /沒有回覆/);
  assert.equal(port.closed, true);
  assert.equal(port.readable.locked, false);
  assert.equal(port.writable.locked, false);
  assert.deepEqual(port.commands, ["HEALTH"]);
});

test("canceling the browser chooser causes no device writes", async () => {
  const error = Object.assign(new Error("No port selected"), { name: "NotFoundError" });
  await assert.rejects(activatePikachu({ serialApi: { requestPort: async () => { throw error; } } }), { name: "NotFoundError" });
});

test("a partially opened port is closed when USB signal setup fails", async () => {
  const port = new FakePort({ failSignals: true });
  await assert.rejects(activatePikachu({ serialApi: { requestPort: async () => port } }), /signal failure/);
  assert.equal(port.closed, true);
});

test("RTC synchronization uses local wall time, including Taipei UTC+8", () => {
  const date = { getTime: () => 1700000000000, getTimezoneOffset: () => -480 };
  assert.equal(localClockEpoch(date), 1700028800);
});

test("command errors leave the connection reusable rather than busy forever", async () => {
  const port = new FakePort();
  const connection = new DeviceConnection(port, { timeout: 100 });
  await connection.open();
  await assert.rejects(connection.command("UNKNOWN"), /拒絕/);
  assert.equal(connection.busy, false);
  const health = await connection.command("HEALTH");
  assert.match(health[0], /^up=/);
  await connection.close();
});
