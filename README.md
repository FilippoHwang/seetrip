# 喜程旅行社 · Seetrip Travel Website

A travel agency website for 喜程旅行社 built with Node.js and Express. No database — all content is stored in `content.json` and managed through the admin panel at `/admin`.

---

## Project Structure

```
seetrip/
├── server.js            ← entire website (routes, HTML, admin)
├── package.json         ← dependencies
├── package-lock.json
├── .gitignore
├── SETUP_GUIDE.md
├── data/
│   ├── content.json      ← all website content (auto-updated by admin)
│   └── auth.json        ← admin password hash (NOT on GitHub)
└── public/
    └── uploads/        ← uploaded images, PDFs, Word files
```

---

## Default Admin Password

```
seetrip2025
```

Go to `/admin` and change it after first login.

---

## Setup on Windows

### 1 — Install Node.js
Download and install from https://nodejs.org (choose LTS version)

Verify:
```bash
node --version
npm --version
```

### 2 — Install Git
Download and install from https://git-scm.com

### 3 — Clone the project
Open **Git Bash** or **Command Prompt**:
```bash
git clone https://github.com/FilippoHwang/seetrip.git
cd seetrip
```

### 4 — Install dependencies
```bash
npm install
```

### 5 — Create missing files
```bash
mkdir public\uploads

echo {"passwordHash":"$2b$10$UkO05dn6OZuBIFIPuqiKZ.V1QdI.NrS2MjbmriaQKxDnshFGW.mC."} > data\auth.json
```

Or download `auth.json` from Google Drive `seetrip/data/` and place it in the `data/` folder.

### 6 — Run
```bash
node server.js
```

Open browser: `http://localhost:3000`
Admin panel: `http://localhost:3000/admin`

---

## Setup on Ubuntu / VirtualBox

### 1 — Install Node.js
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
```
```bash
sudo apt-get install -y nodejs
```

### 2 — Install Git
```bash
sudo apt install git -y
```

### 3 — Clone the project
```bash
git clone https://github.com/FilippoHwang/seetrip.git
cd seetrip
```

### 4 — Install dependencies
```bash
npm install
```

### 5 — Create missing files
```bash
mkdir -p public/uploads
```
```bash
echo '{"passwordHash":"$2b$10$UkO05dn6OZuBIFIPuqiKZ.V1QdI.NrS2MjbmriaQKxDnshFGW.mC."}' > data/auth.json
```

Or download `auth.json` from Google Drive `seetrip/data/` and place it in the `data/` folder.

### 6 — Run
```bash
node server.js
```

Open browser: `http://localhost:3000`
Admin panel: `http://localhost:3000/admin`

---

## Setup on Raspberry Pi (Production)

### 1 — Install Node.js
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
```
```bash
sudo apt-get install -y nodejs
```

### 2 — Install Git
```bash
sudo apt install git -y
```

### 3 — Clone the project
```bash
git clone https://github.com/FilippoHwang/seetrip.git
cd seetrip
```

### 4 — Install dependencies
```bash
npm install
```

### 5 — Create missing files
```bash
mkdir -p public/uploads
```
```bash
echo '{"passwordHash":"$2b$10$UkO05dn6OZuBIFIPuqiKZ.V1QdI.NrS2MjbmriaQKxDnshFGW.mC."}' > data/auth.json
```

Or download `auth.json` from Google Drive `seetrip/data/` and place it in the `data/` folder.

### 6 — Run with PM2 (keeps running after closing terminal)
```bash
sudo npm install -g pm2
pm2 start server.js --name seetrip
pm2 startup
pm2 save
```

Useful PM2 commands:
```bash
pm2 status              # check if running
pm2 restart seetrip     # restart
pm2 stop seetrip        # stop
pm2 logs seetrip        # view error logs
```

---

## Notes

- `auth.json` is NOT on GitHub — must be created manually on each machine or downloaded from Google Drive
- `node_modules/` is NOT on GitHub — run `npm install` to recreate
- `public/uploads/` is NOT on GitHub — uploaded files stay on each machine
- Default password is `seetrip2025` — change it after first login via admin panel

---

© 喜程旅行社 · Seetrip Travel · Chiayi, Taiwan
