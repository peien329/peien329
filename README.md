# 🌍 足跡地圖

記錄你去過的國家、在那裡留下的足跡、照片和故事。

## 功能（v1）

- **互動世界地圖**：可以縮放、拖曳。點一個國家，就能標記「去過」或「想去」
- **足跡**：每個國家底下可以新增多個足跡，每個足跡有地點、日期、照片和故事
- **照片自動定位**：照片如果有 GPS 資訊，會自動帶入國家、位置和拍攝日期
- **在地圖上選位置**：沒有 GPS 的照片，可以直接在地圖上點出位置
- **國家清單**：搜尋、篩選，快速勾選去過或想去的國家（小國家在地圖上不好點時很方便）
- **統計**：去過幾國、佔世界幾 %、七大洲進度、旅行年表
- **備份與還原**：匯出成一個 JSON 檔（包含照片），換手機也不會遺失
- **PWA**：可以加入手機主畫面，像 App 一樣使用，沒有網路也能打開
- 支援深色模式、手機和電腦

> 所有資料都只存在你自己裝置的瀏覽器裡（IndexedDB），不會上傳到任何伺服器。

## 在電腦上執行

這是純靜態網站，不需要安裝或建置，只要用任何靜態伺服器開啟：

```bash
npx http-server -c-1 .
# 或
python3 -m http.server 8080
```

然後打開 http://localhost:8080 。

（直接雙擊 `index.html` 無法使用，因為瀏覽器不允許 `file://` 讀取地圖資料。）

## 放到網路上給手機用（GitHub Pages）

1. 把程式碼合併到 `main` 分支
2. 在 GitHub 的 repo 打開 **Settings → Pages**，**Source** 選 **GitHub Actions**
3. 之後每次推送到 `main`，就會自動部署到 `https://<帳號>.github.io/<repo>/`
4. 用手機打開這個網址：
   - **iPhone（Safari）**：分享 → 加入主畫面
   - **Android（Chrome）**：選單 → 安裝應用程式

## 專案結構

```
index.html              主頁面
css/style.css           樣式（含深色模式）
js/app.js               介面與流程
js/map.js               世界地圖（D3 + TopoJSON）
js/db.js                IndexedDB 資料存取、備份
js/image.js             照片壓縮、讀取 EXIF（GPS、日期）
js/continents.js        各洲國家清單
data/world-50m.json     國界資料（Natural Earth 1:50m，id 為 ISO 國碼）
vendor/                 d3、topojson-client、exifr
sw.js                   Service Worker（離線快取）
manifest.webmanifest    PWA 設定
```

## 接下來可以做的（v2 之後）

- 3D 旋轉地球、旅行路線動畫
- 數位護照印章、成就徽章
- 一鍵產生分享卡片（IG 限動）
- 「那年今日」回憶
- AI 協助撰寫遊記、年度旅行回顧
- 雲端帳號同步（多裝置）、和旅伴共同編輯
- 用 Capacitor 包裝上架 App Store / Google Play

## 資料來源與授權

- 國界：[Natural Earth](https://www.naturalearthdata.com/)（公有領域），經由 [world-atlas](https://github.com/topojson/world-atlas)
- [D3](https://d3js.org/)（ISC）、[topojson-client](https://github.com/topojson/topojson-client)（ISC）、[exifr](https://github.com/MikeKovarik/exifr)（MIT）
- 國家中文名稱來自瀏覽器內建的 `Intl.DisplayNames`
