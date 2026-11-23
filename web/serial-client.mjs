// TamaPoke Web Serial setup. Device replies stay in the visitor's browser.
export class DeviceConnection {
  constructor(port, { timeout = 6000 } = {}) {
    this.port = port;
    this.timeout = timeout;
    this.lines = [];
    this.waiters = [];
    this.buffer = "";
    this.closed = false;
    this.busy = false;
  }

  async open() {
    await this.port.open({ baudRate: 115200, bufferSize: 8192 });
    this.opened = true;
    await this.port.setSignals?.({ dataTerminalReady: true, requestToSend: false });
    this.reader = this.port.readable.getReader();
    this.writer = this.port.writable.getWriter();
    this.pump = this.readLoop();
  }

  async readLoop() {
    const decoder = new TextDecoder();
    try {
      while (!this.closed) {
        const { value, done } = await this.reader.read();
        if (done) break;
        this.buffer += decoder.decode(value, { stream: true });
        let end;
        while ((end = this.buffer.indexOf("\n")) >= 0) {
          const line = this.buffer.slice(0, end).trim();
          this.buffer = this.buffer.slice(end + 1);
          if (!line) continue;
          const waiter = this.waiters.shift();
          if (waiter) waiter.resolve(line);
          else {
            this.lines.push(line);
            if (this.lines.length > 512) this.lines.shift();
          }
        }
      }
    } catch (error) {
      if (!this.closed) this.readError = error;
    } finally {
      for (const waiter of this.waiters.splice(0)) waiter.reject(this.readError || new Error("USB 連線已中斷，請重新連接。"));
    }
  }

  line(timeout) {
    if (this.lines.length) return Promise.resolve(this.lines.shift());
    if (this.readError) return Promise.reject(this.readError);
    return new Promise((resolve, reject) => {
      const waiter = {
        resolve: (line) => { clearTimeout(timer); resolve(line); },
        reject: (error) => { clearTimeout(timer); reject(error); },
      };
      const timer = setTimeout(() => {
        this.waiters = this.waiters.filter((item) => item !== waiter);
        reject(new Error("開發板沒有回覆。請先關閉刷機視窗或其他序列埠程式，再重新連接。"));
      }, timeout);
      this.waiters.push(waiter);
    });
  }

  async command(text) {
    if (this.busy) throw new Error("正在處理上一個操作，請稍候。");
    this.busy = true;
    try {
      await this.writer.write(new TextEncoder().encode(text + "\n"));
      const deadline = Date.now() + this.timeout;
      const reply = [];
      while (Date.now() < deadline) {
        const line = await this.line(Math.max(1, deadline - Date.now()));
        if (line === "ERR") throw new Error("開發板拒絕這個操作，請確認已完成韌體安裝。");
        if (line === "DONE") return reply;
        reply.push(line);
      }
      throw new Error("等待開發板回覆逾時，請重新連接。");
    } finally {
      this.busy = false;
    }
  }

  async put(name, bytes, onChunk = () => {}) {
    if (this.busy) throw new Error("正在處理上一個操作，請稍候。");
    if (!/^mons\/(?:ps?\d{3}|thumbs)\.bin$/.test(name) || !bytes.length || bytes.length > 4 * 1024 * 1024) {
      throw new Error("素材檔案的名稱或大小不正確。");
    }
    this.busy = true;
    const expect = async (token) => {
      const deadline = Date.now() + this.timeout;
      while (Date.now() < deadline) {
        const line = await this.line(Math.max(1, deadline - Date.now()));
        if (line === "ERR") throw new Error("記憶卡寫入失敗。請確認卡片空間與狀態，重新開機後再載入素材。");
        if (line === token) return;
      }
      throw new Error("素材傳輸逾時，請重新開機後再載入。");
    };
    try {
      await this.writer.write(new TextEncoder().encode(`PUT ${name} ${bytes.length}\n`));
      await expect("OK");
      for (let offset = 0; offset < bytes.length; offset += 2048) {
        const chunk = bytes.subarray(offset, offset + 2048);
        await this.writer.write(chunk);
        await expect("#");
        onChunk(chunk.length);
      }
      await expect("DONE");
    } finally {
      this.busy = false;
    }
  }

  async close() {
    this.closed = true;
    if (this.reader) {
      await this.reader.cancel().catch(() => {});
      await this.pump;
      this.reader.releaseLock();
    }
    this.writer?.releaseLock();
    await this.port.close();
    this.opened = false;
  }
}

export function localClockEpoch(date = new Date()) {
  // The board's RTC displays a local wall clock, without a timezone layer.
  return Math.floor(date.getTime() / 1000) - date.getTimezoneOffset() * 60;
}

export async function selectBoardPort(serialApi, onStatus = () => {}) {
  if (!serialApi) throw new Error("請使用電腦版 Chrome 或 Edge 開啟本頁。");
  onStatus("正在尋找剛刷機時已授權的開發板。");
  const granted = typeof serialApi.getPorts === "function" ? await serialApi.getPorts() : [];
  const compatible = granted.filter((port) => port.getInfo?.().usbVendorId === 0x303a);
  let port;
  if (compatible.length === 1) {
    port = compatible[0];
    onStatus("已找到授權的開發板，正在連接。");
  } else {
    onStatus("請在跳出的視窗選擇 USB JTAG/serial debug unit。");
    port = await serialApi.requestPort({ filters: [{ usbVendorId: 0x303a }] });
  }
  return port;
}

export async function activatePikachu({ serialApi, onStatus = () => {}, date = new Date(), timeout = 6000 }) {
  const port = await selectBoardPort(serialApi, onStatus);
  const connection = new DeviceConnection(port, { timeout });
  try {
    await connection.open();
    onStatus("已連接，正在確認 TamaPoke 韌體。");
    const health = await connection.command("HEALTH");
    const initial = await connection.command("STATS");
    if (!health.some((line) => /^up=\d+s\b/.test(line)) || !initial.some((line) => /^spec=-?\d+\b/.test(line))) {
      throw new Error("這個裝置沒有回覆 TamaPoke 狀態，請先完成上一步的韌體安裝。");
    }
    onStatus("正在啟用皮卡丘並儲存角色。");
    await connection.command("SPEC 25");
    onStatus("正在同步電腦的當地時間。");
    await connection.command("TIME " + localClockEpoch(date));
    const stats = await connection.command("STATS");
    let finalHealth = await connection.command("HEALTH");
    if (!finalHealth.some((line) => /\bmon=1\b/.test(line))) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      finalHealth = await connection.command("HEALTH");
    }
    if (!stats.some((line) => /^spec=25\b/.test(line))) throw new Error("角色尚未設定成功，請重試「啟用皮卡丘」。");
    if (!finalHealth.some((line) => /\bmon=1\b/.test(line))) throw new Error("角色已設定，但動畫尚未載入。請重新啟動開發板再試一次。");
    onStatus("完成！皮卡丘已存檔，時間也同步好了。現在可以開始玩；沒有電池時請保持 USB 供電。");
    return { species: 25, spriteLoaded: true, clockSynced: true };
  } finally {
    if (connection.opened) await connection.close();
  }
}
