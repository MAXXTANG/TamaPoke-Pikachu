import { DeviceConnection, selectBoardPort } from "./serial-client.mjs";

export const SPRITE_PACK = Object.freeze({
  url: "./assets/sprites/all-gen1.pak",
  bytes: 41746554,
  payloadBytes: 41740941,
  files: 303,
  sha256: "4f369f6faaa617e16c5de2457ec547c8be24b410bec7411ffb607e64fcd3a2af",
});

export function parseSpritePack(buffer) {
  const data = new Uint8Array(buffer), view = new DataView(buffer);
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const invalid = () => { throw new Error("完整素材包格式不正確，請重新載入網頁。"); };
  if (data.length < 6 || decoder.decode(data.subarray(0, 4)) !== "TPAK") invalid();
  const count = view.getUint16(4, true);
  if (count !== SPRITE_PACK.files) invalid();
  const expected = new Set(["mons/thumbs.bin"]);
  for (let species = 1; species <= 151; species++) {
    for (const form of ["p", "ps"]) expected.add(`mons/${form}${String(species).padStart(3, "0")}.bin`);
  }
  let offset = 6;
  const items = [];
  for (let index = 0; index < count; index++) {
    if (offset >= data.length) invalid();
    const length = data[offset++];
    if (!length || offset + length + 4 > data.length) invalid();
    const name = decoder.decode(data.subarray(offset, offset + length));
    offset += length;
    const size = view.getUint32(offset, true);
    offset += 4;
    if (!expected.delete(name) || !size || size > 4 * 1024 * 1024) invalid();
    items.push({ name, size });
  }
  for (const item of items) {
    if (offset + item.size > data.length) invalid();
    item.data = data.subarray(offset, offset + item.size);
    offset += item.size;
  }
  if (expected.size || offset !== data.length) invalid();
  return items;
}

export async function fetchSpritePack({ fetchApi = fetch, cryptoApi = globalThis.crypto, signal, onStatus = () => {} } = {}) {
  onStatus("正在下載並校驗完整素材包（約 42 MB），請稍候。");
  const response = await fetchApi(SPRITE_PACK.url, { signal });
  if (!response.ok) throw new Error("素材包暫時無法下載，請確認網路後重試。");
  const buffer = await response.arrayBuffer();
  if (buffer.byteLength !== SPRITE_PACK.bytes) throw new Error("素材包下載不完整，請重試。");
  const hash = new Uint8Array(await cryptoApi.subtle.digest("SHA-256", buffer));
  const actual = [...hash].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  if (actual !== SPRITE_PACK.sha256) throw new Error("素材包校驗失敗，尚未寫入記憶卡，請重新下載。");
  return parseSpritePack(buffer);
}

export function spriteListing(lines) {
  const files = new Map();
  for (const line of lines) {
    const match = line.match(/^(?:\/?mons\/)?(ps?\d{3}\.bin|thumbs\.bin) (\d+)$/);
    if (match) files.set("mons/" + match[1], Number(match[2]));
  }
  return files;
}

function canceled() {
  return Object.assign(new Error("已停止；尚未完成全部素材。下次載入會重新傳送全部檔案，不需要重刷遊戲。"), { name: "AbortError" });
}

export async function loadAllSprites({ serialApi, onStatus = () => {}, onProgress = () => {}, signal, getPack = fetchSpritePack, timeout = 6000 }) {
  if (signal?.aborted) throw canceled();
  const port = await selectBoardPort(serialApi, onStatus);
  const connection = new DeviceConnection(port, { timeout });
  try {
    await connection.open();
    const health = await connection.command("HEALTH");
    const stats = await connection.command("STATS");
    if (!health.some((line) => /^up=\d+s\b/.test(line)) || !stats.some((line) => /^spec=-?\d+\b/.test(line))) {
      throw new Error("這個裝置沒有回覆 TamaPoke 狀態，請先完成韌體安裝。");
    }
    if (!health.some((line) => /\bsd=1\b/.test(line))) {
      throw new Error("沒有讀到 microSD 卡，尚未下載或寫入素材。請先斷電、插入已備份且可清空的 FAT32 卡，再重新接上 USB。沒有卡仍可玩內建皮卡丘。");
    }
    const storage = (await connection.command("SDINFO")).join(" ").match(/\btotal=(\d+) used=(\d+)\b/);
    if (!storage) throw new Error("無法確認記憶卡空間，尚未寫入素材。");
    const total = Number(storage[1]), used = Number(storage[2]);
    if (!Number.isSafeInteger(total) || !Number.isSafeInteger(used) || total <= 0 || used < 0 || used > total) {
      throw new Error("記憶卡容量回覆不正確，尚未寫入素材。");
    }
    const existing = spriteListing(await connection.command("LS"));
    // Existing sprite files are replaced, so their storage can be reclaimed.
    // Reserve 16 MiB for FAT allocation slack in addition to the raw payload.
    let reclaimable = existing.get("mons/thumbs.bin") || 0;
    for (let species = 1; species <= 151; species++) {
      for (const form of ["p", "ps"]) reclaimable += existing.get(`mons/${form}${String(species).padStart(3, "0")}.bin`) || 0;
    }
    if (total - used + Math.min(reclaimable, used) < SPRITE_PACK.payloadBytes + 16 * 1024 * 1024) {
      throw new Error("記憶卡空間不足。請準備至少約 64 MB 可用空間，再載入完整素材。");
    }
    if (signal?.aborted) throw canceled();
    const items = await getPack({ signal, onStatus });
    if (items.length !== SPRITE_PACK.files) throw new Error("素材包檔案數不正確，尚未寫入。");
    let bytes = 0, files = 0;
    const totalBytes = items.reduce((sum, item) => sum + item.data.length, 0);
    for (const item of items) {
      // Finish each accepted PUT before honoring Stop, leaving the protocol in
      // command mode rather than sending commands into a partial binary file.
      if (signal?.aborted) throw canceled();
      onStatus(`正在傳送 ${item.name.split("/").at(-1)} · ${files + 1}/${items.length}，請保持 USB 和記憶卡連接。`);
      await connection.put(item.name, item.data, (length) => {
        bytes += length;
        onProgress({ bytes, totalBytes, files, totalFiles: items.length });
      });
      files++;
      onProgress({ bytes, totalBytes, files, totalFiles: items.length });
    }
    onStatus("傳輸完成，正在核對記憶卡上的檔名與大小。");
    const final = spriteListing(await connection.command("LS"));
    if (items.some((item) => final.get(item.name) !== item.data.length)) {
      throw new Error("記憶卡檔案核對未通過，請重新開機後再次載入素材。");
    }
    onStatus("完成！151 隻的一般／異色動畫與圖鑑縮圖已傳入 microSD（303 個檔案）。存檔與目前角色沒有變更。關閉連線後重新開機，讓縮圖重新載入。");
    return { files, bytes, species: 151, shinySpecies: 151, listingVerified: true };
  } finally {
    if (connection.opened) await connection.close();
  }
}
