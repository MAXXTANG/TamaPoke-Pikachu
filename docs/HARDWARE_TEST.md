# 公開網頁 USB 實機測試

2026-11-23，以 **微雪 Waveshare ESP32-S3-Touch-AMOLED-1.75 原版**（16 MB Flash、8 MB OPI PSRAM）、macOS Chrome、USB 供電、**沒有 microSD**，測試 [公開網頁](https://maxxtang.github.io/TamaPoke-Pikachu/) 的新手安裝流程。韌體維持保存的 `1.19-pika`，未重新編譯。

| 步驟 | 實際結果 |
| --- | --- |
| 事前保護 | 完整 16 MB Flash 備份，與裝置整片 MD5 核對；備份只留本機，不包含在公開 repo。 |
| 網頁全新安裝 | 從網頁使用 ESP Web Tools 刷入 factory 映像，顯示 `Installation complete!`。裝置隨後回覆 `spec=-1 nv=1`、圖鑑 `0/151`，確認舊進度已重設。 |
| 網頁啟用 | 按「連接並啟用皮卡丘」，沿用刷機已授權的開發板，顯示完成。裝置回覆 `spec=25 nv=1`、圖鑑 `1/151: 25`、`HEALTH mon=1`，並同步當地時間。 |
| 板上韌體核對 | 唯讀取得 bootloader 區、分割表與 app 的裝置 MD5，三者均與保存檔相同。NVS 已有新存檔，沒有拿它和空白 factory NVS 比對。 |
| 硬體重開機 | 透過 ESP32 硬體重設後，在啟動約 4 秒唯讀查詢；未重送選角指令，仍是 `spec=25 nv=1`、圖鑑只有 #25、`HEALTH mon=1`。 |
| 畫面與觸控 | 2026-11-23 使用者在板上實際確認：「皮卡丘畫面與觸控都正常」。此項來源為使用者回報。 |
| 最後狀態 | 依使用者選擇留下測試後的全新 Lv.1 皮卡丘，沒有還原舊進度。 |

刷機與啟用均由公開網頁完成；命令列僅用於備份、唯讀核對與硬體重設。`STATS` 的 `mon` 是舊載入器欄位，本版 PMD 動畫是否載入以 `HEALTH mon=1` 判定。

## 實際操作截圖

以下是連接實體板時的瀏覽器截圖。

![網頁顯示實機刷入完成](images/hardware-web-install-complete.jpg)

![網頁顯示皮卡丘啟用與時間同步完成](images/hardware-pikachu-activated.jpg)

## 紀錄與範圍

可機讀紀錄：[hardware-web-validation-2026-11-23.json](../evidence/hardware-web-validation-2026-11-23.json)。公開內容已排除裝置 MAC、私人 Flash 備份與舊存檔。

本輪驗證一塊原版 1.75 板與 macOS Chrome。Windows、Edge、1.75C、電池斷電續玩與 microSD 完整 151 隻素材不在本輪測試範圍。裝置回覆確認內建動畫載入與存檔恢復；使用者另確認實體皮卡丘畫面與觸控正常。網站的 22 張遊戲介面圖是同版繪圖程式產生的示例，並非開發板實拍。

[新手安裝](GETTING_STARTED.md) · [完整玩法](PLAYING.md) · [返回專案首頁](../README.md)
