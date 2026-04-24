# 喜程旅行社網站 · 完整安裝指南
# Seetrip Travel Website · Full Setup Guide

---

## 📦 您會得到的檔案 / What's Included

```
seetrip/
├── server.js          ← 主程式（伺服器）
├── package.json       ← 套件清單
├── data/
│   ├── content.json   ← 網站內容（自動更新）
│   └── auth.json      ← 管理員密碼
└── public/
    └── uploads/       ← 上傳的圖片存放在這裡
```

---

## 🍓 PART 1：在 Raspberry Pi 安裝

### 步驟 1：安裝 Node.js（只需做一次）

開啟終端機（Terminal），輸入以下指令：

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

確認安裝成功：
```bash
node --version   # 應該顯示 v20.x.x
npm --version    # 應該顯示 10.x.x
```

---

### 步驟 2：上傳網站檔案到 Raspberry Pi

**方法 A：用隨身碟**
1. 把 `seetrip` 資料夾複製到隨身碟
2. 插入 Raspberry Pi
3. 複製到家目錄：`cp -r /media/pi/USB/seetrip ~/seetrip`

**方法 B：用 FileZilla（SFTP）**
1. 下載 FileZilla（免費）：https://filezilla-project.org/
2. 主機：Raspberry Pi 的 IP（例：`192.168.1.100`）
3. 帳號：`pi`，密碼：您的 Pi 密碼
4. 把 `seetrip` 資料夾拖到 `/home/pi/` 裡

---

### 步驟 3：安裝套件並啟動

```bash
cd ~/seetrip
npm install
node server.js
```

看到以下訊息表示成功：
```
🌏 喜程旅行社 is running!
   Local:   http://localhost:3000
   Network: http://YOUR_PI_IP:3000
   Admin:   http://localhost:3000/admin
```

在瀏覽器輸入 `http://localhost:3000` 就能看到網站了！

---

### 步驟 4：讓網站開機自動啟動（重要！）

不用每次手動啟動，用 PM2 自動管理：

```bash
# 安裝 PM2
sudo npm install -g pm2

# 用 PM2 啟動網站
cd ~/seetrip
pm2 start server.js --name seetrip

# 設定開機自啟
pm2 startup
# ↑ 執行後會顯示一行指令，複製並執行它

pm2 save
```

常用 PM2 指令：
```bash
pm2 status          # 查看狀態
pm2 restart seetrip # 重新啟動
pm2 stop seetrip    # 停止
pm2 logs seetrip    # 查看錯誤日誌
```

---

## 🌐 PART 2：讓網站公開到網際網路

您有以下選擇（推薦使用 Cloudflare Tunnel，免費且安全）：

---

### 選項 A：Cloudflare Tunnel（推薦 ⭐）

**優點：免費、安全、不需要固定 IP、不需要更改路由器設定**

1. **申請 Cloudflare 帳號**
   - 前往 https://cloudflare.com 免費註冊
   - 如果您有自己的網域（例：seetriptravel.com），把它加入 Cloudflare

2. **在 Raspberry Pi 安裝 cloudflared**
   ```bash
   # 下載（ARM64，適用 Raspberry Pi 4）
   wget https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64
   sudo mv cloudflared-linux-arm64 /usr/local/bin/cloudflared
   sudo chmod +x /usr/local/bin/cloudflared
   
   # 登入 Cloudflare
   cloudflared tunnel login
   # ↑ 會開啟瀏覽器，點選您的網域授權
   ```

3. **建立 Tunnel**
   ```bash
   cloudflared tunnel create seetrip
   cloudflared tunnel route dns seetrip www.seetriptravel.com
   ```

4. **啟動 Tunnel**
   ```bash
   cloudflared tunnel run --url http://localhost:3000 seetrip
   ```

5. **設定開機自啟**
   ```bash
   sudo cloudflared service install
   sudo systemctl start cloudflared
   sudo systemctl enable cloudflared
   ```

完成後，`https://www.seetriptravel.com` 就會指向您的 Raspberry Pi！

---

### 選項 B：ngrok（測試用，簡單快速）

適合臨時測試，免費版網址每次重啟會改變。

```bash
# 安裝
curl -s https://ngrok-agent.s3.amazonaws.com/ngrok.asc | sudo tee /etc/apt/trusted.gpg.d/ngrok.asc >/dev/null
echo "deb https://ngrok-agent.s3.amazonaws.com buster main" | sudo tee /etc/apt/sources.list.d/ngrok.list
sudo apt update && sudo apt install ngrok

# 設定 Token（到 https://ngrok.com 免費申請）
ngrok config add-authtoken YOUR_TOKEN

# 啟動
ngrok http 3000
# ↑ 會顯示公開網址，例：https://abc123.ngrok.io
```

---

### 選項 C：傳統路由器 Port Forwarding

如果您有固定 IP 或不想用 Cloudflare：

1. 登入路由器管理介面（通常是 `192.168.1.1`）
2. 找到「Port Forwarding」或「虛擬伺服器」
3. 新增規則：
   - 外部連接埠：80
   - 內部 IP：Raspberry Pi 的 IP（例：`192.168.1.100`）
   - 內部連接埠：3000
4. 到 https://whatismyip.com 查詢您的公開 IP

---

## 🔑 PART 3：使用管理後台

### 登入方式
```
網址：http://您的IP:3000/admin
預設密碼：seetrip2025
```

**⚠️ 第一次登入後請立即更改密碼！**
（點「更改密碼」→ 輸入目前密碼 seetrip2025 → 設定新密碼）

### 管理後台功能

| 功能 | 說明 |
|------|------|
| ✈️ 旅遊行程 | 新增、編輯、刪除行程，上傳圖片 |
| ⚙️ 網站設定 | 修改首頁標題、副標語 |
| 📞 聯絡資訊 | 更新電話、地址、Email、營業時間 |
| 🛂 簽證說明 | 修改簽證頁說明文字 |
| 📢 公告管理 | 顯示/隱藏網站頂部公告 |
| 🔒 更改密碼 | 修改登入密碼 |

---

## 🔧 常見問題排除

**問：網站打不開？**
```bash
# 確認伺服器是否在執行
pm2 status
# 如果沒有，重新啟動
pm2 restart seetrip
```

**問：忘記管理員密碼？**
```bash
# 重設為預設密碼 seetrip2025
cd ~/seetrip
node -e "const b=require('bcryptjs');const fs=require('fs');const h=b.hashSync('seetrip2025',10);fs.writeFileSync('data/auth.json',JSON.stringify({passwordHash:h},null,2));console.log('密碼已重設！')"
```

**問：上傳圖片失敗？**
```bash
# 確認上傳資料夾有寫入權限
chmod 777 ~/seetrip/public/uploads
```

**問：如何備份資料？**
```bash
# 只需備份 data/ 資料夾和 public/uploads/ 即可
cp -r ~/seetrip/data ~/backup-data-$(date +%Y%m%d)
cp -r ~/seetrip/public/uploads ~/backup-uploads-$(date +%Y%m%d)
```

---

## 📱 媽媽使用說明（給不懂電腦的人）

**更新行程的步驟：**
1. 用電腦或手機打開瀏覽器
2. 輸入網址：`http://Pi的IP:3000/admin`
3. 輸入密碼，點「登入管理後台」
4. 左邊選單選「旅遊行程」
5. 點「＋ 新增行程」，填寫資料，按「新增行程」
6. 完成！網站會立刻更新

**修改電話的步驟：**
1. 登入管理後台
2. 左邊選「聯絡資訊」
3. 修改電話號碼
4. 按「儲存資訊」
5. 完成！

---

## 📞 技術支援

如果遇到問題，可以把以下資訊提供給技術人員：
```bash
node --version
npm --version
pm2 logs seetrip --lines 50
```

---

*喜程旅行社網站系統 · 以愛心建立 ❤️*
