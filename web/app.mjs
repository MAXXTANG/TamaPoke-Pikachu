import { activatePikachu } from "./serial-client.mjs";

const $ = (selector) => document.querySelector(selector);
const browserSupported = "serial" in navigator && window.isSecureContext;
let verified = false;
let installerReady = false;
let activating = false;

function updateButtons() {
  $("#install-button").disabled = !browserSupported || !verified || !installerReady || !$("#correct-board").checked || !$("#erase-consent").checked;
  $("#activate-button").disabled = !browserSupported || activating;
}

if (!browserSupported) {
  $("#browser-note").hidden = false;
  $("#browser-note").textContent = "刷機需要電腦版 Chrome 或 Edge，並允許 USB 序列埠連線。你仍可在目前的瀏覽器閱讀圖解與玩法。";
}

for (const checkbox of document.querySelectorAll(".install-check")) checkbox.addEventListener("change", updateButtons);
updateButtons();

async function checkFirmware() {
  try {
    const response = await fetch("./firmware/tamapoke-1.19-pika-factory.bin");
    if (!response.ok) throw new Error("無法下載韌體");
    const bytes = await response.arrayBuffer();
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    const actual = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
    if (actual !== "c3a9322abf99bde35e127f2ff6e3f1a8a55e9d658a664b807df6dc0f39b29e3b") throw new Error("韌體校驗不一致");
    verified = true;
    $("#package-status").textContent = "韌體檔案已準備好 · v1.19-pika";
    $("#package-status").dataset.state = "ready";
  } catch {
    $("#package-status").textContent = "韌體檔案暫時無法載入，請確認網路後重新整理。";
    $("#package-status").dataset.state = "error";
  }
  updateButtons();
}
checkFirmware();

customElements.whenDefined("esp-web-install-button").then(() => { installerReady = true; updateButtons(); });
setTimeout(() => {
  if (!installerReady) $("#package-status").textContent = "刷機元件尚未載入，請重新整理頁面。";
}, 12000);

$("#activate-button").addEventListener("click", async () => {
  if (activating) return;
  activating = true;
  updateButtons();
  const status = $("#activation-status");
  status.dataset.state = "working";
  try {
    await activatePikachu({ serialApi: navigator.serial, onStatus: (message) => { status.textContent = message; } });
    status.dataset.state = "success";
    $("#setup-complete").hidden = false;
  } catch (error) {
    status.dataset.state = "error";
    status.textContent = error.name === "NotFoundError" ? "尚未選擇開發板。接好 USB 後，再按一次並選擇裝置即可。" : error.message;
  } finally {
    activating = false;
    updateButtons();
  }
});

const screens = [
  ["home", "daily", "主畫面", "你的日常照顧中心", "中間是皮卡丘，下方四條需求越高越好。輕點角色可以摸摸；食物、精靈球、燈泡、洗澡四個按鈕由左到右排列。", "主畫面", "其他頁依下方圖解返回。"],
  ["feeding", "daily", "餵食選單", "三色樹果與糖果", "點左下食物圖示後，選單會出現約六秒。皮卡丘喜歡藍樹果；糖果偶爾吃就好，吃多會增加體重。", "主畫面點食物", "選一種食物，或點選單外收起。"],
  ["eating", "daily", "進食動畫", "剛餵下食物的樣子", "餵食後會短暫播放進食動作；吃到喜歡的樹果會增加額外心情與羈絆。", "餵一顆樹果", "動畫會自己結束。"],
  ["sleep", "daily", "睡眠", "有 Zz 才是真的睡了", "點燈泡入睡，精力會逐分鐘恢復。關閉螢幕不等於睡眠；想讓牠休息，要先按燈泡。", "主畫面點燈泡", "再點一次燈泡喚醒。"],
  ["bath", "daily", "洗澡", "等泡泡動畫結束即可", "點洗澡按鈕後約三秒，便便會清除，清潔恢復到 100。不用逐顆戳泡泡。", "主畫面點最右側按鈕", "動畫完成後自動回到主畫面。"],
  ["profile", "card", "角色資料", "姓名、羈絆與喜好", "角色卡第一頁有等級、每日照顧連續天數、羈絆與樹果喜好。點頂端姓名可以改暱稱。", "主畫面向上滑", "點一般內容區，或再向上滑。"],
  ["stats", "card", "能力與體重", "力量訓練從這裡進入", "ATK 是攻擊、DEF 是防禦、SPD 是速度、WGT 是體重。下方 TRAIN STRENGTH 按鈕可進行力量訓練。", "角色卡向左滑一頁", "點一般內容區回主畫面。"],
  ["medals", "card", "勳章", "看看你們一起達成了什麼", "勳章記錄等級、喜好、連續照顧與其他養成成就。畫面示範數值不代表新存檔一開始就擁有。", "角色卡向左滑到第三頁", "點一般內容區回主畫面。"],
  ["progress", "card", "成長進度", "下一級與進化還差多少", "等級主要隨實際時間成長，照顧失誤會延後進化。看這頁能知道下一級、進化需求和失誤次數。", "角色卡向左滑到第四頁", "點一般內容區回主畫面。"],
  ["training", "games", "力量訓練", "十秒鐘，輕點沙袋", "點沙袋累積命中，每四下約增加一點力量。這塊原版 1.75 板可點畫面最頂端提前離開。", "能力頁點 TRAIN STRENGTH", "十秒結束後自動返回；也可點頂端退出。"],
  ["minigame", "games", "精靈球小遊戲", "把球打回空中", "直接點球附近，讓它不要落地。上方三個小點代表機會；第三次落地後結算。", "主畫面點精靈球", "結算後自動返回；點頂端可提前退出。"],
  ["game-results", "games", "小遊戲結算", "看看這次拿了幾分", "正常結算會增加心情與速度訓練值，也會消耗精力。提前退出沒有本局獎勵。", "小遊戲第三次落地", "等約四秒自動返回。"],
  ["pokedex", "collection", "圖鑑", "慢慢完成 151 個登錄位置", "登錄位置不代表全部動畫都內建。本版不用卡可玩皮卡丘與雷丘；完整圖鑑縮圖需另備 microSD 素材。", "主畫面向左或向右滑", "點頂端標題；或第一頁向右滑。"],
  ["pokedex-detail", "collection", "圖鑑詳情", "單獨看看已登錄的夥伴", "點圖鑑中的一格，查看該角色與資料。圖像是否出現，取決於是否有對應素材。", "圖鑑點一格", "輕點畫面或水平滑動，回格狀列表。"],
  ["settings", "collection", "時間與設定", "亮度、聲音、語言都在這裡", "按加減調整時間，再按 OK。底部可改音量、亮度和語言；裝置有八種語言，預設英文，沒有中文。", "主畫面向下滑", "OK 套用；上下滑會取消時間編輯並離開。"],
  ["rename", "collection", "暱稱鍵盤", "幫牠取一個自己的名字", "最多十一個字元，支援 A–Z、句點與連字號。清空後按 OK，就恢復物種名稱。", "角色卡第一頁點頂端姓名", "鍵盤按 OK 完成。"],
  ["starter", "growth", "初始選角", "刷入後還看到這頁？", "這是原遊戲的御三家選擇。想直接玩皮卡丘，回本頁按「連接並啟用皮卡丘」，不必在這裡選。", "全新安裝且尚未啟用皮卡丘", "使用網頁啟用；或自行選一個御三家。"],
  ["egg", "growth", "蛋", "輕點三下就能孵化", "自行選御三家後會看到蛋；點三次孵化，也能等約三個遊戲分鐘。網頁啟用皮卡丘會直接進入皮卡丘主畫面。", "從原始選角選一隻", "輕點蛋三次。"],
  ["evolution", "growth", "進化確認", "你決定牠什麼時候進化", "達成等級且四需求都至少 40，才會出現進化選項。可選進化，也可維持原型態。", "達成條件後點紅色進化按鈕", "選擇進化或維持型態。"],
  ["farewell", "growth", "告別確認", "陪伴一段時間後的選擇", "最終型態並養成滿三天後，可選告別或繼續陪伴。告別會結束這隻的養成並出現新蛋。", "符合條件後點告別按鈕", "選擇告別或繼續陪伴。"],
  ["release", "growth", "放生確認", "長按角色三秒才會開啟", "只有確認放生才會結束目前角色。只是想摸摸牠，輕點後放開即可。", "主畫面長按角色三秒", "選 NO 取消，YES 才會放生。"],
  ["runaway", "growth", "逃跑提示", "牠需要你的照顧", "四需求長時間全零會出現逃跑按鈕；補回照顧可取消。這不是一打開畫面就自動結束。", "長時間忽略照顧後", "先餵食、休息、清潔與陪伴。"],
];

const gallery = $("#screen-gallery");
for (const [id, category, title, subtitle, description, enter, exit] of screens) {
  const figure = document.createElement("figure");
  figure.className = "screen-card";
  figure.dataset.category = category;
  figure.innerHTML = `<button class="screen-open" type="button" aria-label="查看${title}介面與操作方式"><img src="./assets/screens/${id}.png" alt="${title}的同版程式渲染示例" width="466" height="466" loading="lazy"></button><figcaption><h3>${title}</h3><p>${subtitle}</p><button class="text-button screen-detail" type="button">看操作方式</button></figcaption>`;
  const show = () => {
    $("#screen-modal-title").textContent = title;
    $("#screen-modal-image").src = `./assets/screens/${id}.png`;
    $("#screen-modal-image").alt = title + "的同版程式渲染示例";
    $("#screen-modal-description").textContent = description;
    $("#screen-modal-enter").textContent = enter;
    $("#screen-modal-exit").textContent = exit;
    $("#screen-modal").showModal();
  };
  figure.querySelector(".screen-open").addEventListener("click", show);
  figure.querySelector(".screen-detail").addEventListener("click", show);
  gallery.append(figure);
}

for (const filter of document.querySelectorAll(".screen-filter")) {
  filter.addEventListener("click", () => {
    for (const button of document.querySelectorAll(".screen-filter")) button.setAttribute("aria-pressed", String(button === filter));
    const category = filter.dataset.filter;
    let count = 0;
    for (const card of gallery.children) {
      card.hidden = category !== "all" && card.dataset.category !== category;
      if (!card.hidden) count++;
    }
    $("#screen-count").textContent = `${count} 個介面示例`;
  });
}
$("#screen-modal-close").addEventListener("click", () => $("#screen-modal").close());
$("#screen-modal").addEventListener("click", (event) => { if (event.target === event.currentTarget) event.currentTarget.close(); });
