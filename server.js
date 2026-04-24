const express = require('express');
const session = require('express-session');
const multer  = require('multer');
const bcrypt  = require('bcryptjs');
const fs      = require('fs');
const path    = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── File paths ────────────────────────────────────────────────────────────────
const DATA_FILE  = path.join(__dirname, 'data', 'content.json');
const AUTH_FILE  = path.join(__dirname, 'data', 'auth.json');
const UPLOAD_DIR = path.join(__dirname, 'public', 'uploads');

// ── Helpers ───────────────────────────────────────────────────────────────────
function readData()       { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
function writeData(data)  { fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8'); }
function readAuth()       { return JSON.parse(fs.readFileSync(AUTH_FILE, 'utf8')); }
function writeAuth(data)  { fs.writeFileSync(AUTH_FILE, JSON.stringify(data, null, 2), 'utf8'); }
function requireLogin(req, res, next) {
  if (req.session && req.session.admin) return next();
  res.redirect('/admin/login');
}

// ── Middleware ─────────────────────────────────────────────────────────────────
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: 'seetrip-secret-key-2025',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 8 * 60 * 60 * 1000 }
}));

// ── Multer ────────────────────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext  = path.extname(file.originalname);
    const name = Date.now() + '-' + Math.round(Math.random() * 1e9) + ext;
    cb(null, name);
  }
});
const ALLOWED_MIMES = [
  'image/jpeg','image/png','image/gif','image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
];
const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIMES.includes(file.mimetype)) cb(null, true);
    else cb(new Error('只允許上傳圖片、PDF 或 Word 檔案'));
  }
});
// Multer for multiple fields: image + scheduleFile
const uploadTourFields = upload.fields([
  { name: 'image', maxCount: 1 },
  { name: 'scheduleFile', maxCount: 1 }
]);

// ── PUBLIC ROUTES ─────────────────────────────────────────────────────────────

app.get('/', (req, res) => {
  const data = readData();
  res.send(renderPublic(data));
});

// Trip detail page
app.get('/trip/:id', (req, res) => {
  const data = readData();
  const tour = (data.tours || []).find(t => t.id === req.params.id);
  if (!tour) return res.redirect('/');
  res.send(renderTripDetail(data, tour));
});

// ── ADMIN ROUTES ──────────────────────────────────────────────────────────────

app.get('/admin/login', (req, res) => res.send(renderLogin('')));

app.post('/admin/login', (req, res) => {
  const { password } = req.body;
  const auth = readAuth();
  if (bcrypt.compareSync(password, auth.passwordHash)) {
    req.session.admin = true;
    res.redirect('/admin');
  } else {
    res.send(renderLogin('密碼錯誤，請再試一次。'));
  }
});

app.get('/admin/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/admin/login');
});

app.get('/admin', requireLogin, (req, res) => {
  const data = readData();
  res.send(renderAdmin(data, null));
});

// Update site settings
app.post('/admin/site', requireLogin, (req, res) => {
  const data = readData();
  data.site.name       = req.body.name       || data.site.name;
  data.site.tagline    = req.body.tagline    || data.site.tagline;
  data.site.subtagline = req.body.subtagline || data.site.subtagline;
  data.site.heroText   = req.body.heroText   || data.site.heroText;
  writeData(data);
  res.redirect('/admin?saved=site');
});

// Update contact
app.post('/admin/contact', requireLogin, (req, res) => {
  const data = readData();
  data.contact = { ...data.contact, ...req.body };
  writeData(data);
  res.redirect('/admin?saved=contact');
});

// Add tour
app.post('/admin/tours/add', requireLogin, uploadTourFields, (req, res) => {
  const data = readData();
  const files = req.files || {};
  const newTour = {
    id:           Date.now().toString(),
    name:         req.body.name,
    tag:          req.body.tag,
    duration:     req.body.duration,
    description:  req.body.description,
    price:        req.body.price || '請洽詢報價',
    image:        files.image        ? '/uploads/' + files.image[0].filename        : '',
    scheduleFile: files.scheduleFile ? '/uploads/' + files.scheduleFile[0].filename : '',
    featured:     req.body.featured === 'on',
    departDate:   req.body.departDate || '',
    schedule:     parseSchedule(req.body.schedule || ''),
    flights:      req.body.flights  || '',
    includes:     req.body.includes || '',
    excludes:     req.body.excludes || '',
    deposit:      req.body.deposit  || ''
  };
  data.tours.push(newTour);
  writeData(data);
  res.redirect('/admin?saved=tour');
});

// Edit tour
app.post('/admin/tours/edit/:id', requireLogin, uploadTourFields, (req, res) => {
  const data = readData();
  const tour = data.tours.find(t => t.id === req.params.id);
  const files = req.files || {};
  if (tour) {
    tour.name        = req.body.name;
    tour.tag         = req.body.tag;
    tour.duration    = req.body.duration;
    tour.description = req.body.description;
    tour.price       = req.body.price || '請洽詢報價';
    tour.featured    = req.body.featured === 'on';
    tour.departDate  = req.body.departDate || '';
    tour.schedule    = parseSchedule(req.body.schedule || tour.schedule || '');
    tour.flights     = req.body.flights  || tour.flights  || '';
    tour.includes    = req.body.includes || tour.includes || '';
    tour.excludes    = req.body.excludes || tour.excludes || '';
    tour.deposit     = req.body.deposit  || tour.deposit  || '';
    if (files.image)        tour.image        = '/uploads/' + files.image[0].filename;
    if (files.scheduleFile) tour.scheduleFile = '/uploads/' + files.scheduleFile[0].filename;
  }
  writeData(data);
  res.redirect('/admin?saved=tour');
});

// Delete tour
app.post('/admin/tours/delete/:id', requireLogin, (req, res) => {
  const data = readData();
  data.tours = data.tours.filter(t => t.id !== req.params.id);
  writeData(data);
  res.redirect('/admin?saved=tour');
});

// Announcements
app.post('/admin/announcement', requireLogin, (req, res) => {
  const data = readData();
  if (!data.announcements) data.announcements = [];
  const active = req.body.active === 'on';
  if (req.body.annoId) {
    const ann = data.announcements.find(a => a.id === req.body.annoId);
    if (ann) { ann.text = req.body.text; ann.active = active; }
  } else {
    data.announcements.push({ id: Date.now().toString(), text: req.body.text, active });
  }
  writeData(data);
  res.redirect('/admin?saved=announcement');
});

app.post('/admin/announcement/delete/:id', requireLogin, (req, res) => {
  const data = readData();
  data.announcements = (data.announcements || []).filter(a => a.id !== req.params.id);
  writeData(data);
  res.redirect('/admin');
});

// Visa info
app.post('/admin/visa', requireLogin, (req, res) => {
  const data = readData();
  data.visa_info = req.body.visa_info;
  writeData(data);
  res.redirect('/admin?saved=visa');
});

// Change password
app.post('/admin/password', requireLogin, (req, res) => {
  const { current, newpass, confirm } = req.body;
  const auth = readAuth();
  if (!bcrypt.compareSync(current, auth.passwordHash)) {
    return res.send(renderAdmin(readData(), '✗ 目前密碼錯誤'));
  }
  if (newpass !== confirm) {
    return res.send(renderAdmin(readData(), '✗ 新密碼不一致'));
  }
  if (newpass.length < 6) {
    return res.send(renderAdmin(readData(), '✗ 密碼長度應至少6字'));
  }
  auth.passwordHash = bcrypt.hashSync(newpass, 10);
  writeAuth(auth);
  res.redirect('/admin?saved=password');
});

// ── START SERVER ──────────────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🌏 喜程旅行社 is running!`);
  console.log(`   Local:   http://localhost:${PORT}`);
  console.log(`   Network: http://YOUR_PI_IP:${PORT}`);
  console.log(`   Admin:   http://localhost:${PORT}/admin`);
  console.log(`   Default password: seetrip2025\n`);
});

// ╔══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ╚══════════════════════════════════════════════════════════════════════════════

// Parse schedule: each line is "Day N: Title | desc | meal1, meal2 | Hotel"
// Or if it's already an array (from old data) pass through
function parseSchedule(raw) {
  if (Array.isArray(raw)) return raw;
  if (!raw || !raw.trim()) return [];
  // Try JSON first
  try { return JSON.parse(raw); } catch(e) {}
  // Plain text: each line = one day
  return raw.split('\n').filter(l => l.trim()).map((line, i) => {
    const parts = line.split('|').map(s => s.trim());
    return {
      day:   i + 1,
      title: parts[0] || `第 ${i+1} 天`,
      desc:  parts[1] || '',
      meals: parts[2] || '',
      hotel: parts[3] || ''
    };
  });
}

function esc(str) {
  if (str === undefined || str === null) return '';
  return String(str)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#x27;');
}

// ╔══════════════════════════════════════════════════════════════════════════════
// SHARED CSS / HEAD
// ╚══════════════════════════════════════════════════════════════════════════════

const SHARED_CSS = `
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;1,400&family=Noto+Serif+TC:wght@300;400;600&family=DM+Sans:wght@300;400;500&display=swap" rel="stylesheet">
<style>
:root{--ink:#1a1410;--cream:#f7f3ed;--gold:#c8963e;--gold-l:#e8c87a;--rust:#b94c2a;--sand:#d4c4a8;--muted:#7a6e62;--warm:#fdf9f4}
*{margin:0;padding:0;box-sizing:border-box}
html{scroll-behavior:smooth}
body{background:var(--warm);color:var(--ink);font-family:'DM Sans','Noto Serif TC',sans-serif;overflow-x:hidden}

/* NAV */
nav{position:fixed;top:0;left:0;right:0;z-index:100;display:flex;align-items:center;justify-content:space-between;padding:0 5%;height:70px;background:rgba(247,243,237,.93);backdrop-filter:blur(12px);border-bottom:1px solid rgba(200,150,62,.18)}
.nav-logo{font-family:'Playfair Display',serif;font-size:1.25rem;color:var(--ink);text-decoration:none}.nav-logo span{color:var(--gold)}
.nav-links{display:flex;gap:2rem;list-style:none}
.nav-links a{font-size:.8rem;letter-spacing:.1em;text-transform:uppercase;color:var(--ink);text-decoration:none;font-weight:500;transition:color .2s}
.nav-links a:hover{color:var(--gold)}
.nav-cta{background:var(--ink)!important;color:var(--cream)!important;padding:.4rem 1.1rem;border-radius:2px;transition:background .2s!important}
.nav-cta:hover{background:var(--gold)!important;color:var(--ink)!important}
.ham{display:none;background:none;border:none;cursor:pointer;font-size:1.4rem;color:var(--ink)}
@media(max-width:700px){.nav-links{display:none;flex-direction:column;position:absolute;top:70px;left:0;right:0;background:var(--cream);padding:1.5rem 5%;gap:1.2rem;border-bottom:1px solid var(--sand)}.nav-links.open{display:flex}.ham{display:block}}

/* ANNOUNCE */
.announce{background:var(--ink);color:var(--cream);text-align:center;padding:.6rem 5%;font-size:.82rem;letter-spacing:.05em}

/* HERO */
.hero{min-height:100vh;display:grid;grid-template-columns:1fr 1fr;padding-top:70px;overflow:hidden}
@media(max-width:900px){.hero{grid-template-columns:1fr;min-height:auto}}
.hero-text{display:flex;flex-direction:column;justify-content:center;padding:5rem 5%}
.eyebrow{font-size:.7rem;letter-spacing:.3em;text-transform:uppercase;color:var(--gold);margin-bottom:1.4rem;display:flex;align-items:center;gap:.8rem;animation:fadeUp .8s ease both}
.eyebrow::before{content:'';width:32px;height:1px;background:var(--gold)}
h1{font-family:'Playfair Display',serif;font-size:clamp(2.6rem,5vw,4.8rem);line-height:1.1;margin-bottom:1.5rem;animation:fadeUp .8s .1s ease both}
h1 em{font-style:italic;color:var(--gold)}
.hero-sub{font-family:'Noto Serif TC',serif;font-weight:300;font-size:.95rem;line-height:1.9;color:var(--muted);max-width:400px;margin-bottom:2.5rem;animation:fadeUp .8s .2s ease both}
.hero-btns{display:flex;gap:1rem;flex-wrap:wrap;animation:fadeUp .8s .3s ease both}
.btn{display:inline-block;padding:.85rem 2rem;font-size:.78rem;letter-spacing:.14em;text-transform:uppercase;font-weight:600;text-decoration:none;border:none;cursor:pointer;border-radius:2px;transition:all .2s}
.btn-primary{background:var(--gold);color:var(--ink)}.btn-primary:hover{background:var(--gold-l);transform:translateY(-1px)}
.btn-ghost{background:transparent;color:var(--ink);border:1px solid var(--sand)}.btn-ghost:hover{border-color:var(--gold);color:var(--gold)}
.hero-imgs{display:grid;grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr;gap:4px;overflow:hidden;animation:fadeIn 1.2s .2s ease both}
@media(max-width:900px){.hero-imgs{height:60vw}}
.hero-imgs .hi{overflow:hidden}.hero-imgs .hi:first-child{grid-row:1/3}
.hi-inner{width:100%;height:100%;min-height:200px;transition:transform 5s ease}
.hero-imgs .hi:hover .hi-inner{transform:scale(1.04)}
.hi1{background:linear-gradient(160deg,#e8a87c,#c25f2a,#3d1f0a)}
.hi2{background:linear-gradient(160deg,#b8d4e8,#6090b8,#2a5070)}
.hi3{background:linear-gradient(160deg,#f0d080,#c8901a,#7a4f10)}

/* MARQUEE */
.marquee-bar{background:var(--ink);color:var(--cream);padding:.8rem 0;overflow:hidden;white-space:nowrap}
.mtrack{display:inline-flex;animation:marquee 22s linear infinite}
.mitem{font-size:.7rem;letter-spacing:.2em;text-transform:uppercase;padding:0 2.5rem;display:flex;align-items:center;gap:.7rem}
.mitem::before{content:'◆';color:var(--gold);font-size:.45rem}

/* SECTIONS */
.section{padding:5rem 5%}
.section-label{font-size:.68rem;letter-spacing:.28em;text-transform:uppercase;color:var(--gold);margin-bottom:.7rem;display:flex;align-items:center;gap:.7rem}
.section-label::before{content:'';width:24px;height:1px;background:var(--gold)}
h2{font-family:'Playfair Display',serif;font-size:clamp(1.8rem,3vw,2.6rem);line-height:1.25}
.sec-head{display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:3rem;flex-wrap:wrap;gap:1rem}
.see-all{font-size:.75rem;letter-spacing:.12em;text-transform:uppercase;color:var(--ink);text-decoration:none;display:flex;align-items:center;gap:.4rem;transition:all .2s}
.see-all:hover{color:var(--gold);gap:.7rem}.see-all::after{content:'→'}

/* TOURS GRID */
.tours-grid{display:grid;grid-template-columns:1.4fr 1fr 1fr;gap:2px;background:var(--sand)}
@media(max-width:900px){.tours-grid{grid-template-columns:1fr}}
.tour-card{background:var(--warm);overflow:hidden;cursor:pointer;display:flex;flex-direction:column;transition:transform .2s;text-decoration:none;color:inherit}
.tour-card:hover{transform:translateY(-3px)}
.tour-img{height:260px;flex-shrink:0;transition:transform .5s ease;background-size:cover!important;background-position:center!important}
.tour-featured .tour-img{height:400px}
.tour-card:hover .tour-img{transform:scale(1.04)}
.tour-body{padding:1.6rem;flex:1;display:flex;flex-direction:column}
.tour-tag{font-size:.63rem;letter-spacing:.18em;text-transform:uppercase;color:var(--gold);font-weight:600;margin-bottom:.5rem}
.tour-name{font-family:'Playfair Display',serif;font-size:1.15rem;line-height:1.35;margin-bottom:.7rem}
.tour-featured .tour-name{font-size:1.4rem}
.tour-desc{font-size:.84rem;color:var(--muted);line-height:1.75;font-family:'Noto Serif TC',serif;font-weight:300;flex:1;margin-bottom:1rem}
.tour-meta{display:flex;justify-content:space-between;align-items:center;padding-top:.9rem;border-top:1px solid rgba(200,150,62,.18)}
.tour-dur{font-size:.75rem;color:var(--muted)}.tour-price{font-size:.8rem;color:var(--gold);font-weight:600}
.tour-arrow{display:inline-flex;align-items:center;gap:.4rem;font-size:.72rem;color:var(--gold);letter-spacing:.1em;text-transform:uppercase;margin-top:.8rem}

/* ALL TOURS LIST */
.tours-list{display:flex;flex-direction:column;gap:1.5rem}
.list-tour{display:grid;grid-template-columns:260px 1fr;background:var(--warm);overflow:hidden;border:1px solid rgba(200,150,62,.12);transition:border-color .2s;text-decoration:none;color:inherit}
.list-tour:hover{border-color:var(--gold)}
@media(max-width:700px){.list-tour{grid-template-columns:1fr}.list-tour-img{height:200px}}
.list-tour-img{height:180px;background-size:cover!important;background-position:center!important}
.list-tour-body{padding:1.4rem;display:flex;flex-direction:column;gap:.5rem}
.list-tour-body h3{font-family:'Playfair Display',serif;font-size:1.1rem}
.list-tour-body p{font-size:.84rem;color:var(--muted);line-height:1.7;font-family:'Noto Serif TC',serif;font-weight:300}

/* STRIP */
.info-strip{background:var(--ink);display:grid;grid-template-columns:repeat(4,1fr)}
@media(max-width:800px){.info-strip{grid-template-columns:1fr 1fr}}
@media(max-width:500px){.info-strip{grid-template-columns:1fr}}
.strip-item{padding:2.5rem 3rem;border-right:1px solid rgba(255,255,255,.07)}
.strip-item:last-child{border-right:none}
.strip-icon{font-size:1.4rem;margin-bottom:.8rem}
.strip-title{font-family:'Playfair Display',serif;font-size:1rem;color:var(--cream);margin-bottom:.5rem}
.strip-text{font-size:.8rem;color:rgba(247,243,237,.5);line-height:1.7}

/* VISA */
.visa-section{display:grid;grid-template-columns:1fr 1fr;gap:5rem;align-items:center;padding:5rem 5%}
@media(max-width:900px){.visa-section{grid-template-columns:1fr}}
.visa-img{height:440px;background:linear-gradient(160deg,#c8b090,#8a6840);border-radius:2px}
.visa-text p{font-family:'Noto Serif TC',serif;font-weight:300;font-size:.9rem;line-height:1.9;color:var(--muted);margin:1.2rem 0 2rem}
.visa-list{list-style:none;display:flex;flex-direction:column;gap:.8rem;margin-bottom:2.2rem}
.visa-list li{font-size:.85rem;display:flex;align-items:center;gap:.7rem}
.visa-list li::before{content:'';width:18px;height:1px;background:var(--gold);flex-shrink:0}

/* CONTACT */
.contact-section{display:grid;grid-template-columns:1fr 1fr;gap:5rem;padding:5rem 5%}
@media(max-width:900px){.contact-section{grid-template-columns:1fr}}
.form-row{display:grid;grid-template-columns:1fr 1fr;gap:1rem}
@media(max-width:500px){.form-row{grid-template-columns:1fr}}
.fg{display:flex;flex-direction:column;gap:.35rem;margin-bottom:.9rem}
.fg label{font-size:.67rem;letter-spacing:.15em;text-transform:uppercase;color:var(--muted)}
.fg input,.fg textarea,.fg select{background:var(--cream);border:1px solid var(--sand);padding:.8rem 1rem;font-size:.88rem;color:var(--ink);font-family:'DM Sans',sans-serif;border-radius:2px;outline:none;transition:border-color .2s;width:100%}
.fg input:focus,.fg textarea:focus,.fg select:focus{border-color:var(--gold)}
.fg textarea{resize:vertical;min-height:110px}
.contact-info p{font-family:'Noto Serif TC',serif;font-weight:300;font-size:.88rem;color:var(--muted);line-height:1.9;margin:1rem 0 2rem}
.clist{list-style:none;display:flex;flex-direction:column;gap:1rem}
.clist li{display:flex;gap:.9rem;font-size:.87rem;line-height:1.6;align-items:flex-start}
.clist .ci{color:var(--gold);width:1.2rem;flex-shrink:0}
.clist a{color:var(--ink);text-decoration:none;transition:color .2s}.clist a:hover{color:var(--gold)}

/* FOOTER */
.divider{margin:0 5%;height:1px;background:var(--sand)}
footer{padding:2.5rem 5%;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:1.5rem}
.flogo{font-family:'Playfair Display',serif;font-size:1.1rem}.flogo span{color:var(--gold)}
.ftag{font-size:.68rem;letter-spacing:.18em;text-transform:uppercase;color:var(--muted);margin-top:.3rem}
.flinks{display:flex;gap:1.8rem;list-style:none;flex-wrap:wrap}
.flinks a{font-size:.72rem;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);text-decoration:none;transition:color .2s}.flinks a:hover{color:var(--gold)}
.fcopy{font-size:.72rem;color:var(--muted);line-height:1.8;text-align:right}

/* TRIP DETAIL PAGE */
.trip-detail{padding-top:70px;min-height:100vh}
.trip-hero{height:55vh;min-height:380px;background-size:cover!important;background-position:center!important;position:relative;display:flex;align-items:flex-end}
.trip-hero-overlay{position:absolute;inset:0;background:linear-gradient(to top,rgba(26,20,16,.92) 0%,rgba(26,20,16,.2) 60%,transparent 100%)}
.trip-hero-content{position:relative;z-index:1;padding:3rem 5%;width:100%}
.trip-hero-content .tour-tag{font-size:.7rem;margin-bottom:.6rem;display:block}
.trip-hero-content h1{font-family:'Playfair Display',serif;font-size:clamp(1.8rem,4vw,3rem);color:var(--cream);margin-bottom:1rem}
.trip-hero-meta{display:flex;gap:1.5rem;font-size:.82rem;color:rgba(247,243,237,.7);flex-wrap:wrap}
.trip-hero-meta span{display:flex;align-items:center;gap:.4rem}

.trip-content{max-width:1100px;margin:0 auto;padding:3rem 5%}
.trip-tabs{display:flex;gap:0;border-bottom:1px solid var(--sand);margin-bottom:2.5rem;overflow-x:auto}
.tab-btn{padding:.8rem 1.6rem;font-size:.75rem;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);border:none;background:none;cursor:pointer;border-bottom:2px solid transparent;transition:all .2s;white-space:nowrap}
.tab-btn.active{color:var(--gold);border-bottom-color:var(--gold)}
.tab-pane{display:none}.tab-pane.active{display:block}

/* Schedule */
.schedule-list{display:flex;flex-direction:column;gap:0}
.day-item{display:grid;grid-template-columns:80px 1fr;gap:1.5rem;padding:1.5rem 0;border-bottom:1px solid rgba(200,150,62,.12)}
.day-item:last-child{border-bottom:none}
.day-num-col{display:flex;flex-direction:column;align-items:center;padding-top:.2rem}
.day-num-badge{width:40px;height:40px;border-radius:50%;background:rgba(200,150,62,.1);border:1px solid rgba(200,150,62,.3);display:flex;align-items:center;justify-content:center;font-family:'Playfair Display',serif;font-size:.9rem;color:var(--gold);flex-shrink:0}
.day-line{flex:1;width:1px;background:rgba(200,150,62,.15);margin-top:.5rem}
.day-content{}
.day-title{font-family:'Playfair Display',serif;font-size:1.1rem;margin-bottom:.5rem}
.day-desc{font-size:.88rem;color:var(--muted);line-height:1.8;font-family:'Noto Serif TC',serif;font-weight:300;margin-bottom:.8rem}
.day-meals{display:flex;gap:.5rem;flex-wrap:wrap;margin-bottom:.5rem}
.meal-tag{font-size:.72rem;padding:.25rem .7rem;background:rgba(200,150,62,.08);color:var(--gold);border:1px solid rgba(200,150,62,.2);border-radius:2px}
.day-hotel{font-size:.78rem;color:var(--muted);display:flex;align-items:center;gap:.4rem}

/* Flights table */
.flights-table{width:100%;border-collapse:collapse;font-size:.88rem}
.flights-table th{text-align:left;padding:.7rem 1rem;font-size:.7rem;letter-spacing:.12em;text-transform:uppercase;color:var(--gold);background:rgba(200,150,62,.05);border-bottom:1px solid rgba(200,150,62,.2)}
.flights-table td{padding:.75rem 1rem;border-bottom:1px solid rgba(200,150,62,.08);color:var(--muted)}
.flights-table tr:hover td{background:rgba(200,150,62,.03);color:var(--ink)}

/* Pricing */
.price-hero-block{background:linear-gradient(135deg,var(--ink),#3a2a18);border-radius:4px;padding:2rem;margin-bottom:1.5rem;color:var(--cream)}
.price-main{display:flex;align-items:baseline;gap:.5rem;margin-bottom:.5rem}
.price-big{font-family:'Playfair Display',serif;font-size:3rem;color:var(--gold-l)}
.price-curr{font-size:1.3rem;color:var(--gold-l)}
.price-unit{font-size:.85rem;color:rgba(247,243,237,.6)}
.price-deposit{font-size:.82rem;color:rgba(247,243,237,.6);margin-top:.3rem}
.inc-grid{display:grid;grid-template-columns:1fr 1fr;gap:1.5rem;margin-top:1.5rem}
@media(max-width:600px){.inc-grid{grid-template-columns:1fr}}
.inc-block h4{font-size:.72rem;letter-spacing:.2em;text-transform:uppercase;margin-bottom:.8rem;padding-bottom:.5rem;border-bottom:1px solid var(--sand)}
.inc-block h4.inc{color:var(--gold)}.inc-block h4.exc{color:#c06060}
.inc-list{list-style:none;display:flex;flex-direction:column;gap:.5rem}
.inc-list li{font-size:.83rem;color:var(--muted);display:flex;align-items:flex-start;gap:.5rem;line-height:1.6}
.inc-list li::before{content:'✓';color:var(--gold);flex-shrink:0}
.exc-list li::before{content:'✗';color:#c06060}
.inquiry-box{background:var(--cream);border:1px solid var(--sand);border-radius:4px;padding:1.5rem;margin-top:1.5rem;text-align:center}
.inquiry-box p{font-size:.88rem;color:var(--muted);margin-bottom:1rem}

/* ANIMATIONS */
@keyframes fadeUp{from{opacity:0;transform:translateY(22px)}to{opacity:1;transform:none}}
@keyframes fadeIn{from{opacity:0}to{opacity:1}}
@keyframes marquee{from{transform:translateX(0)}to{transform:translateX(-50%)}}
.reveal{opacity:0;transform:translateY(28px);transition:opacity .65s ease,transform .65s ease}
.reveal.visible{opacity:1;transform:none}
.reveal-d1{transition-delay:.1s}.reveal-d2{transition-delay:.2s}
</style>`;

// ╔══════════════════════════════════════════════════════════════════════════════
// PUBLIC PAGE
// ╚══════════════════════════════════════════════════════════════════════════════

function renderPublic(data) {
  const tours = data.tours || [];
  const featured = tours.filter(t => t.featured).slice(0, 3);
  const announcement = (data.announcements || []).find(a => a.active);

  const toursHTML = featured.map((t, i) => {
    const imgStyle = t.image
      ? `background: url('${t.image}') center/cover no-repeat;`
      : `background: ${['linear-gradient(160deg,#e8a87c,#c25f2a,#3d1f0a)',
                        'linear-gradient(160deg,#b8d4e8,#6090b8,#2a5070)',
                        'linear-gradient(160deg,#f0d080,#c8901a,#7a4f10)'][i % 3]};`;
    return `
    <a href="/trip/${esc(t.id)}" class="tour-card ${i === 0 ? 'tour-featured' : ''} reveal ${i > 0 ? 'reveal-d' + i : ''}">
      <div class="tour-img" style="${imgStyle}"></div>
      <div class="tour-body">
        <div class="tour-tag">${esc(t.tag)}</div>
        <div class="tour-name">${esc(t.name)}</div>
        <div class="tour-desc">${esc(t.description)}</div>
        <div class="tour-meta">
          <span class="tour-dur">✦ ${esc(t.duration)}</span>
          <span class="tour-price">${esc(t.price)}</span>
        </div>
        <span class="tour-arrow">查看行程 →</span>
      </div>
    </a>`;
  }).join('');

  const allToursHTML = tours.map(t => {
    const imgStyle = t.image
      ? `background: url('${t.image}') center/cover no-repeat;`
      : `background: linear-gradient(160deg,#c8b090,#8a6840);`;
    return `
    <a href="/trip/${esc(t.id)}" class="list-tour reveal">
      <div class="list-tour-img" style="${imgStyle}"></div>
      <div class="list-tour-body">
        <span class="tour-tag">${esc(t.tag)}</span>
        <h3>${esc(t.name)}</h3>
        <p>${esc(t.description)}</p>
        <div class="tour-meta">
          <span class="tour-dur">✦ ${esc(t.duration)}</span>
          <span class="tour-price">${esc(t.price)}</span>
        </div>
      </div>
    </a>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(data.site.name)} · 旅遊行程</title>
${SHARED_CSS}
</head>
<body>
${announcement ? `<div class="announce">${esc(announcement.text)}</div>` : ''}
<nav>
  <a href="/" class="nav-logo">喜程<span>旅行社</span></a>
  <button class="ham" onclick="toggleMenu()">☰</button>
  <ul class="nav-links" id="navLinks">
    <li><a href="#tours">精選行程</a></li>
    <li><a href="#all-tours">所有行程</a></li>
    <li><a href="#visa">簽證資訊</a></li>
    <li><a href="#contact">聯絡我們</a></li>
    <li><a href="#contact" class="nav-cta">立即諮詢</a></li>
  </ul>
</nav>

<section class="hero">
  <div class="hero-text">
    <div class="eyebrow">${esc(data.site.subtagline)}</div>
    <h1>${esc(data.site.tagline).replace(/，/,'，<br>').replace(/旅/,'旅<br><em>').replace(/。/,'</em>')}</h1>
    <p class="hero-sub">${esc(data.site.heroText)}</p>
    <div class="hero-btns">
      <a href="#tours" class="btn btn-primary">瀏覽行程</a>
      <a href="#contact" class="btn btn-ghost">免費諮詢</a>
    </div>
  </div>
  <div class="hero-imgs">
    <div class="hi"><div class="hi-inner hi1"></div></div>
    <div class="hi"><div class="hi-inner hi2"></div></div>
    <div class="hi"><div class="hi-inner hi3"></div></div>
  </div>
</section>

<div class="marquee-bar" aria-hidden="true">
  <div class="mtrack">
    <span class="mitem">泰國旅遊</span><span class="mitem">日本北海道</span><span class="mitem">歐洲豪華遊輪</span>
    <span class="mitem">簽證資訊</span><span class="mitem">旅遊平安險</span><span class="mitem">專業導遊</span>
    <span class="mitem">泰國旅遊</span><span class="mitem">日本北海道</span><span class="mitem">歐洲豪華遊輪</span>
    <span class="mitem">簽證資訊</span><span class="mitem">旅遊平安險</span><span class="mitem">專業導遊</span>
  </div>
</div>

<section class="section" id="tours">
  <div class="sec-head reveal">
    <div><div class="section-label">精選行程</div><h2>探索熱門目的地<br>旅程的起點</h2></div>
    <a href="#all-tours" class="see-all">所有行程</a>
  </div>
  <div class="tours-grid">${toursHTML}</div>
</section>

<div class="info-strip">
  <div class="strip-item reveal"><div class="strip-icon">♦</div><div class="strip-title">專業規劃</div><div class="strip-text">專業旅遊顧問服務，精心安排行程，讓您的旅行既輕鬆又充實。</div></div>
  <div class="strip-item reveal reveal-d1"><div class="strip-icon">✈</div><div class="strip-title">簽證服務</div><div class="strip-text">一站式簽證申辦服務，協助確認最新入境規定，省心出行。</div></div>
  <div class="strip-item reveal reveal-d2"><div class="strip-icon">⬧</div><div class="strip-title">保險保障</div><div class="strip-text">提供完善的旅遊保險方案，讓您全程在保障之下享受旅遊。</div></div>
  <div class="strip-item reveal"><div class="strip-icon">✦</div><div class="strip-title">精選飯店</div><div class="strip-text">嚴選各地優質住宿，兼顧舒適與價格，讓旅程更加完美。</div></div>
</div>

<section id="all-tours" class="section" style="background:var(--cream)">
  <div class="sec-head reveal">
    <div><div class="section-label">完整行程</div><h2>所有旅遊<br>行程一覽</h2></div>
  </div>
  <div class="tours-list">${allToursHTML}</div>
</section>

<div class="visa-section" id="visa">
  <div class="visa-img reveal"></div>
  <div class="visa-text reveal reveal-d1">
    <div class="section-label">簽證資訊</div>
    <h2>出境前準備<br>讓出行更順暢</h2>
    <p>${esc(data.visa_info)}</p>
    <ul class="visa-list">
      <li>泰國、日本、韓國免簽或落地簽申辦</li>
      <li>歐美長途旅遊所需簽證協助</li>
      <li>旅遊簽證快速代辦服務</li>
      <li>出行前最新入境規定確認</li>
    </ul>
    <a href="#contact" class="btn btn-primary">諮詢簽證資訊</a>
  </div>
</div>

<section class="contact-section" id="contact">
  <div class="reveal">
    <div class="section-label">聯絡我們</div>
    <h2 style="margin-bottom:1rem">隨時聯絡<br>您的旅遊夥伴</h2>
    <p style="font-family:'Noto Serif TC',serif;font-weight:300;font-size:.9rem;color:var(--muted);line-height:1.9;margin-bottom:2rem">無論計劃中還是臨時起意，我們的旅遊顧問隨時為您服務，協助安排最完美的旅遊行程。</p>
    <form action="mailto:${esc(data.contact.email)}" method="get" enctype="text/plain">
      <div class="form-row">
        <div class="fg"><label>姓名</label><input type="text" name="姓名" placeholder="您的姓名"></div>
        <div class="fg"><label>聯絡電話</label><input type="tel" name="電話" placeholder="0900-000-000"></div>
      </div>
      <div class="fg"><label>感興趣的行程</label>
        <select name="行程">
          <option>請選擇行程</option>
          ${tours.map(t => `<option>${esc(t.name)}</option>`).join('')}
          <option>其他？請告訴我們</option>
        </select>
      </div>
      <div class="fg"><label>詢問內容</label><textarea name="內容" placeholder="請描述您的需求或問題…"></textarea></div>
      <button type="submit" class="btn btn-primary">發送詢問</button>
    </form>
  </div>
  <div class="contact-info reveal reveal-d1">
    <div class="section-label">聯絡資訊</div>
    <h2 style="margin-bottom:.5rem">${esc(data.site.name)}</h2>
    <p>嘉義在地旅行社，我們的旅遊顧問提供最貼心的旅遊服務，從計劃到出發一條龍搞定。</p>
    <ul class="clist">
      <li><span class="ci">📍</span><span>${esc(data.contact.address)}</span></li>
      <li><span class="ci">📞</span><a href="tel:${data.contact.phone.replace(/-/g,'')}">${esc(data.contact.phone)}</a></li>
      <li><span class="ci">📠</span><span>${esc(data.contact.fax)}</span></li>
      <li><span class="ci">✉</span><a href="mailto:${esc(data.contact.email)}">${esc(data.contact.email)}</a></li>
      <li><span class="ci">🕐</span><span>${esc(data.contact.hours)}</span></li>
      <li><span class="ci">🏢</span><span>統一編號：${esc(data.contact.regnum)}</span></li>
    </ul>
  </div>
</section>

<div class="divider"></div>
<footer>
  <div><div class="flogo">喜程<span>旅行社</span></div><div class="ftag">Seetrip Travel · Chiayi</div></div>
  <ul class="flinks">
    <li><a href="#tours">旅遊行程</a></li><li><a href="#visa">簽證資訊</a></li>
    <li><a href="#contact">聯絡我們</a></li><li><a href="/admin">管理後台</a></li>
  </ul>
  <div class="fcopy">${esc(data.site.name)} © ${new Date().getFullYear()}<br>${esc(data.contact.address)}</div>
</footer>

<script>
function toggleMenu(){document.getElementById('navLinks').classList.toggle('open')}
const obs=new IntersectionObserver(entries=>entries.forEach(e=>{if(e.isIntersecting){e.target.classList.add('visible');obs.unobserve(e.target)}}),{threshold:.12});
document.querySelectorAll('.reveal').forEach(el=>obs.observe(el));
window.addEventListener('scroll',()=>{const s=window.scrollY;const h=document.querySelector('.hero-imgs');if(h&&s<window.innerHeight)h.style.transform='translateY('+(s*.1)+'px)'});
</script>
</body></html>`;
}

// ╔══════════════════════════════════════════════════════════════════════════════
// TRIP DETAIL PAGE
// ╚══════════════════════════════════════════════════════════════════════════════

function renderTripDetail(data, tour) {
  const imgStyle = tour.image
    ? `background: url('${tour.image}') center/cover no-repeat;`
    : `background: linear-gradient(160deg,#e8a87c,#c25f2a,#3d1f0a);`;

  const schedule = Array.isArray(tour.schedule) ? tour.schedule : parseSchedule(tour.schedule || '');
  const sf = tour.scheduleFile || '';
  const sfExt = sf.split('.').pop().toLowerCase();
  const sfIsPdf = sfExt === 'pdf';
  const sfIsWord = sfExt === 'doc' || sfExt === 'docx';

  // Schedule tab: uploaded file takes priority, then manual text schedule
  let scheduleHTML;
  if (sf && sfIsPdf) {
    scheduleHTML = `
      <div style="margin-bottom:1rem;display:flex;align-items:center;gap:12px;flex-wrap:wrap">
        <span style="font-size:.8rem;color:var(--muted)">已上傳行程表 PDF</span>
        <a href="${sf}" target="_blank" download style="font-size:.78rem;background:var(--gold);color:var(--ink);padding:.3rem .9rem;border-radius:2px;text-decoration:none;letter-spacing:.08em">⬇ 下載行程表</a>
      </div>
      <div style="border:1px solid var(--sand);border-radius:4px;overflow:hidden;background:var(--cream)">
        <iframe src="${sf}" style="width:100%;height:700px;border:none;display:block"></iframe>
      </div>`;
  } else if (sf && sfIsWord) {
    scheduleHTML = `
      <div style="background:var(--cream);border:1px solid var(--sand);border-radius:4px;padding:2rem;text-align:center">
        <div style="font-size:2.5rem;margin-bottom:1rem">📄</div>
        <div style="font-family:'Playfair Display',serif;font-size:1.2rem;margin-bottom:.5rem">行程表 Word 檔案</div>
        <p style="font-size:.85rem;color:var(--muted);margin-bottom:1.5rem">點擊下方按鈕下載完整行程表</p>
        <a href="${sf}" download style="background:var(--gold);color:var(--ink);padding:.75rem 2rem;border-radius:2px;text-decoration:none;font-size:.82rem;font-weight:600;letter-spacing:.1em;text-transform:uppercase">⬇ 下載 Word 行程表</a>
      </div>`;
  } else if (schedule.length > 0) {
    scheduleHTML = `<div class="schedule-list">${schedule.map((d, i) => `
      <div class="day-item">
        <div class="day-num-col">
          <div class="day-num-badge">${d.day || (i+1)}</div>
          ${i < schedule.length - 1 ? '<div class="day-line"></div>' : ''}
        </div>
        <div class="day-content">
          <div class="day-title">${esc(d.title)}</div>
          ${d.desc ? `<div class="day-desc">${esc(d.desc)}</div>` : ''}
          ${d.meals ? `<div class="day-meals">${d.meals.split(',').map(m=>`<span class="meal-tag">${esc(m.trim())}</span>`).join('')}</div>` : ''}
          ${d.hotel ? `<div class="day-hotel">🏨 ${esc(d.hotel)}</div>` : ''}
        </div>
      </div>`).join('')}</div>`;
  } else {
    scheduleHTML = `<p style="color:var(--muted);font-size:.9rem">行程詳情請聯絡我們，將由專人為您說明。</p>`;
  }

  const flightsText = tour.flights || '';
  const flightsHTML = flightsText
    ? `<div style="background:var(--cream);border-radius:4px;padding:1.5rem">
        <pre style="font-family:'DM Sans',sans-serif;font-size:.88rem;color:var(--muted);line-height:1.9;white-space:pre-wrap">${esc(flightsText)}</pre>
       </div>`
    : `<p style="color:var(--muted);font-size:.9rem">航班資訊請聯絡我們確認最新班次。</p>`;

  const includesLines = (tour.includes || '').split('\n').filter(l=>l.trim());
  const excludesLines = (tour.excludes || '').split('\n').filter(l=>l.trim());

  return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(tour.name)} · ${esc(data.site.name)}</title>
${SHARED_CSS}
</head>
<body>
<nav>
  <a href="/" class="nav-logo">喜程<span>旅行社</span></a>
  <button class="ham" onclick="toggleMenu()">☰</button>
  <ul class="nav-links" id="navLinks">
    <li><a href="/#tours">精選行程</a></li>
    <li><a href="/#all-tours">所有行程</a></li>
    <li><a href="/#visa">簽證資訊</a></li>
    <li><a href="/#contact">聯絡我們</a></li>
    <li><a href="/#contact" class="nav-cta">立即諮詢</a></li>
  </ul>
</nav>

<div class="trip-detail">
  <div class="trip-hero" style="${imgStyle}">
    <div class="trip-hero-overlay"></div>
    <div class="trip-hero-content">
      <span class="tour-tag" style="color:var(--gold-l)">${esc(tour.tag)}</span>
      <h1>${esc(tour.name)}</h1>
      <div class="trip-hero-meta">
        <span>✦ ${esc(tour.duration)}</span>
        ${tour.departDate ? `<span>📅 出發：${esc(tour.departDate)}</span>` : ''}
        <span>💰 ${esc(tour.price)}</span>
      </div>
    </div>
  </div>

  <div class="trip-content">
    <div style="margin-bottom:1.5rem">
      <a href="/" style="font-size:.78rem;color:var(--muted);text-decoration:none;letter-spacing:.08em">← 返回所有行程</a>
    </div>

    <div class="trip-tabs">
      <button class="tab-btn active" onclick="switchTab('schedule',this)">行程安排</button>
      <button class="tab-btn" onclick="switchTab('flights',this)">參考航班</button>
      <button class="tab-btn" onclick="switchTab('pricing',this)">費用說明</button>
    </div>

    <div class="tab-pane active" id="tab-schedule">
      ${scheduleHTML}
    </div>

    <div class="tab-pane" id="tab-flights">
      ${flightsHTML}
      <p style="font-size:.78rem;color:var(--muted);margin-top:1rem">※ 航班資訊僅供參考，實際班次依出發日確認。</p>
    </div>

    <div class="tab-pane" id="tab-pricing">
      <div class="price-hero-block">
        <div class="price-main">
          <span class="price-curr">NT$</span>
          <span class="price-big">${esc(tour.price)}</span>
          <span class="price-unit">/ 人起</span>
        </div>
        ${tour.deposit ? `<div class="price-deposit">訂金：每人 NT$ ${esc(tour.deposit)}</div>` : ''}
      </div>
      ${(includesLines.length || excludesLines.length) ? `
      <div class="inc-grid">
        ${includesLines.length ? `
        <div class="inc-block">
          <h4 class="inc">費用包含</h4>
          <ul class="inc-list">${includesLines.map(l=>`<li>${esc(l)}</li>`).join('')}</ul>
        </div>` : ''}
        ${excludesLines.length ? `
        <div class="inc-block">
          <h4 class="exc">費用不含</h4>
          <ul class="inc-list exc-list">${excludesLines.map(l=>`<li>${esc(l)}</li>`).join('')}</ul>
        </div>` : ''}
      </div>` : ''}
      <div class="inquiry-box">
        <p>有任何費用或行程相關問題，歡迎隨時洽詢我們的旅遊顧問。</p>
        <a href="tel:${data.contact.phone.replace(/-/g,'')}" class="btn btn-primary">📞 ${esc(data.contact.phone)}</a>
        &nbsp;
        <a href="/#contact" class="btn btn-ghost">填寫諮詢表單</a>
      </div>
    </div>
  </div>
</div>

<div class="divider"></div>
<footer>
  <div><div class="flogo">喜程<span>旅行社</span></div><div class="ftag">Seetrip Travel · Chiayi</div></div>
  <ul class="flinks">
    <li><a href="/#tours">旅遊行程</a></li><li><a href="/#contact">聯絡我們</a></li>
  </ul>
  <div class="fcopy">${esc(data.site.name)} © ${new Date().getFullYear()}</div>
</footer>

<script>
function toggleMenu(){document.getElementById('navLinks').classList.toggle('open')}
function switchTab(name,btn){
  document.querySelectorAll('.tab-pane').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
  document.getElementById('tab-'+name).classList.add('active');
  btn.classList.add('active');
}
</script>
</body></html>`;
}

// ╔══════════════════════════════════════════════════════════════════════════════
// ADMIN PANEL
// ╚══════════════════════════════════════════════════════════════════════════════

const ADMIN_CSS = `
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;600&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Noto Sans TC',sans-serif;background:#f4f1ed;color:#1a1410;min-height:100vh}
.topbar{background:#1a1410;color:#f7f3ed;padding:0 2rem;height:60px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:50}
.topbar-title{font-size:1.05rem;font-weight:600;display:flex;align-items:center;gap:.7rem}
.topbar-title .gold{color:#c8963e}
.topbar-links{display:flex;gap:1.2rem;align-items:center}
.topbar-links a{color:rgba(247,243,237,.7);text-decoration:none;font-size:.82rem;transition:color .2s}
.topbar-links a:hover{color:#c8963e}
.topbar-links .view-site{background:#c8963e;color:#1a1410;padding:.3rem .9rem;border-radius:2px;font-weight:600}
.layout{display:grid;grid-template-columns:220px 1fr;min-height:calc(100vh - 60px)}
@media(max-width:700px){.layout{grid-template-columns:1fr}}
.sidebar{background:#1a1410;padding:1.5rem 0}
@media(max-width:700px){.sidebar{display:none}}
.sidebar-item{display:block;padding:.75rem 1.5rem;color:rgba(247,243,237,.65);text-decoration:none;font-size:.88rem;transition:all .2s;border-left:3px solid transparent;cursor:pointer;background:none;border-right:none;border-top:none;border-bottom:none;width:100%;text-align:left}
.sidebar-item:hover,.sidebar-item.active{color:#c8963e;border-left-color:#c8963e;background:rgba(200,150,62,.07)}
.main{padding:2rem;max-width:1000px}
.toast{background:#2a5;color:#fff;padding:.8rem 1.2rem;border-radius:4px;margin-bottom:1.5rem;font-size:.88rem}
.error{background:#c33;color:#fff;padding:.8rem 1.2rem;border-radius:4px;margin-bottom:1.5rem;font-size:.88rem}
.card{background:#fff;border-radius:4px;border:1px solid #e0d8cc;margin-bottom:1.5rem;overflow:hidden}
.card-header{padding:1rem 1.5rem;background:#fdf9f4;border-bottom:1px solid #e0d8cc;display:flex;align-items:center;justify-content:space-between}
.card-title{font-weight:600;font-size:.95rem;display:flex;align-items:center;gap:.5rem}
.card-body{padding:1.5rem}
.panel{display:none}.panel.active{display:block}
label{display:block;font-size:.78rem;letter-spacing:.08em;text-transform:uppercase;color:#7a6e62;margin-bottom:.3rem;font-weight:500}
input[type=text],input[type=email],input[type=tel],input[type=password],textarea,select{width:100%;padding:.7rem .9rem;border:1px solid #d4c4a8;border-radius:3px;font-size:.9rem;font-family:inherit;color:#1a1410;background:#fff;outline:none;transition:border-color .2s}
input:focus,textarea:focus,select:focus{border-color:#c8963e}
textarea{resize:vertical;min-height:90px}
.frow{display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-bottom:1rem}
@media(max-width:600px){.frow{grid-template-columns:1fr}}
.fg{margin-bottom:1rem}
.btn-save{background:#c8963e;color:#1a1410;border:none;padding:.7rem 1.8rem;border-radius:3px;font-size:.85rem;font-weight:600;cursor:pointer;transition:background .2s;font-family:inherit}
.btn-save:hover{background:#e8c87a}
.ab{border:none;padding:.35rem .7rem;border-radius:3px;font-size:.78rem;cursor:pointer;font-family:inherit;transition:opacity .2s}
.ab-edit{background:#e8f0ff;color:#2a5}
.ab-del{background:#ffee8;color:#c33}
.ab:hover{opacity:.75}
table{width:100%;border-collapse:collapse;font-size:.88rem}
th{text-align:left;padding:.6rem .8rem;border-bottom:2px solid #e0d8cc;font-size:.75rem;text-transform:uppercase;letter-spacing:.08em;color:#7a6e62;background:#fdf9f4}
td{padding:.65rem .8rem;border-bottom:1px solid #f0e8dc;vertical-align:middle}
tr:last-child td{border-bottom:none}
.check-row{display:flex;align-items:center;gap:.5rem;margin-bottom:.5rem}
.check-row input{width:auto}
.check-row label{margin:0;text-transform:none;font-size:.88rem;color:#1a1410;font-weight:400}
.modal-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:200;align-items:center;justify-content:center}
.modal-overlay.open{display:flex}
.modal{background:#fff;width:90%;max-width:600px;border-radius:6px;overflow:hidden;max-height:90vh;overflow-y:auto}
.modal-header{padding:1.1rem 1.5rem;background:#1a1410;color:#f7f3ed;display:flex;justify-content:space-between;align-items:center}
.modal-header h3{font-size:1rem}
.modal-close{background:none;border:none;color:#f7f3ed;font-size:1.3rem;cursor:pointer;line-height:1}
.modal-body{padding:1.5rem}
.modal-foot{padding:1rem 1.5rem;background:#fdf9f4;border-top:1px solid #e0d8cc;display:flex;justify-content:flex-end;gap:.8rem}
.btn-cancel{background:#e0d8cc;color:#1a1410;border:none;padding:.6rem 1.4rem;border-radius:3px;font-size:.85rem;cursor:pointer;font-family:inherit}
.welcome{background:linear-gradient(135deg,#1a1410,#3a2a1a);color:#f7f3ed;padding:2rem;border-radius:6px;margin-bottom:1.5rem}
.welcome h2{font-size:1.3rem;margin-bottom:.4rem}.welcome h2 .gold{color:#c8963e}
.welcome p{font-size:.88rem;color:rgba(247,243,237,.65);line-height:1.7}
.schedule-hint{font-size:.75rem;color:#7a6e62;margin-top:.3rem;line-height:1.6;background:#fdf9f4;border:1px solid #e0d8cc;padding:.6rem .8rem;border-radius:3px}
</style>`;

function renderAdmin(data, errorMsg) {
  const tours = data.tours || [];

  const toursTableRows = tours.map(t => `
    <tr>
      <td>${esc(t.name)}</td>
      <td>${esc(t.tag)}</td>
      <td>${esc(t.duration)}</td>
      <td>${t.featured ? '✅' : '—'}</td>
      <td>
        <button class="ab ab-edit" onclick="openEditModal('${esc(t.id)}','${esc(t.name).replace(/'/g,"\\'")}','${esc(t.tag).replace(/'/g,"\\'")}','${esc(t.duration).replace(/'/g,"\\'")}','${esc(t.description).replace(/'/g,"\\'").replace(/\n/,'\\n')}','${esc(t.price).replace(/'/g,"\\'")}','${esc(t.departDate||'').replace(/'/g,"\\'")}',\`${(t.schedule||[]).length ? JSON.stringify(t.schedule).replace(/`/g,'\\`') : ''}\`,'${esc(t.flights||'').replace(/'/g,"\\'").replace(/\n/g,'\\n')}','${esc(t.includes||'').replace(/'/g,"\\'").replace(/\n/g,'\\n')}','${esc(t.excludes||'').replace(/'/g,"\\'").replace(/\n/g,'\\n')}','${esc(t.deposit||'').replace(/'/g,"\\'")}','${esc(t.scheduleFile||\'\')}',${t.featured})">✏️ 編輯</button>
        <form method="POST" action="/admin/tours/delete/${t.id}" style="display:inline" onsubmit="return confirm('確定要刪除？')">
          <button class="ab ab-del" type="submit">🗑 刪除</button>
        </form>
      </td>
    </tr>`).join('');

  const annRows = (data.announcements || []).map(a => `
    <tr>
      <td>${esc(a.text)}</td>
      <td>${a.active ? '✅ 顯示中' : '隱藏'}</td>
      <td>
        <button class="ab ab-edit" onclick="openAnnModal('${a.id}','${esc(a.text).replace(/'/g,"\\'")}',${a.active})">✏️ 編輯</button>
        <form method="POST" action="/admin/announcement/delete/${a.id}" style="display:inline" onsubmit="return confirm('確定要刪除？')">
          <button class="ab ab-del" type="submit">🗑</button>
        </form>
      </td>
    </tr>`).join('');

  return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>管理後台 · 喜程旅行社</title>
${ADMIN_CSS}
</head>
<body>

<div class="topbar">
  <div class="topbar-title">⚙ 喜程 <span>旅行社 · <span class="gold">管理後台</span></span></div>
  <div class="topbar-links">
    <a href="/" class="view-site" target="_blank">🌐 查看網站</a>
    <a href="/admin/logout">登出</a>
  </div>
</div>

<div class="layout">
  <nav class="sidebar">
    <button class="sidebar-item active" onclick="show('dashboard')">🏠 總覽</button>
    <button class="sidebar-item" onclick="show('tours')">✈️ 旅遊行程</button>
    <button class="sidebar-item" onclick="show('site')">⚙️ 網站設定</button>
    <button class="sidebar-item" onclick="show('contact')">📞 聯絡資訊</button>
    <button class="sidebar-item" onclick="show('visa')">🛂 簽證說明</button>
    <button class="sidebar-item" onclick="show('announce')">📢 公告管理</button>
    <button class="sidebar-item" onclick="show('password')">🔒 更改密碼</button>
  </nav>

  <main class="main">
    ${errorMsg ? `<div class="error">${esc(errorMsg)}</div>` : ''}
    <div id="toast" class="toast" style="display:none"></div>

    <!-- DASHBOARD -->
    <div class="panel active" id="panel-dashboard">
      <div class="welcome">
        <h2>歡迎回來，<span class="gold">喜程旅行社</span> 管理員 👋</h2>
        <p>這是您的管理後台。您可以在這裡更新旅遊行程（含每日行程表）、網站設定、聯絡資訊、簽證說明、公告。<br>所有更改立即在網站上生效，無需寫程式。</p>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:1rem;margin-bottom:1.5rem">
        <div class="card" style="margin:0"><div class="card-body" style="text-align:center;padding:1.5rem">
          <div style="font-size:2rem;margin-bottom:.4rem">✈️</div>
          <div style="font-size:1.8rem;font-weight:700;color:#c8963e">${tours.length}</div>
          <div style="font-size:.8rem;color:#7a6e62;margin-top:.2rem">旅遊行程</div>
        </div></div>
        <div class="card" style="margin:0"><div class="card-body" style="text-align:center;padding:1.5rem">
          <div style="font-size:2rem;margin-bottom:.4rem">📢</div>
          <div style="font-size:1.8rem;font-weight:700;color:#c8963e">${(data.announcements||[]).filter(a=>a.active).length}</div>
          <div style="font-size:.8rem;color:#7a6e62;margin-top:.2rem">活躍公告</div>
        </div></div>
      </div>
      <div class="card"><div class="card-header"><div class="card-title">📋 快速操作指南</div></div>
        <div class="card-body" style="display:flex;flex-direction:column;gap:.8rem;line-height:1.8;font-size:.9rem;color:#5a5048">
          <p>📌 點選 <strong>旅遊行程</strong> — 新增、編輯、刪除行程，上傳圖片，填寫每日行程、航班、費用</p>
          <p>📌 點選 <strong>網站設定</strong> — 修改首頁標題、副標語</p>
          <p>📌 點選 <strong>聯絡資訊</strong> — 更新電話、地址、Email、營業時間</p>
          <p>📌 點選 <strong>公告管理</strong> — 顯示/隱藏網站頂部公告</p>
          <p>📌 點選 <strong>更改密碼</strong> — 修改登入密碼</p>
        </div>
      </div>
    </div>

    <!-- TOURS -->
    <div class="panel" id="panel-tours">
      <div class="card">
        <div class="card-header">
          <div class="card-title">✈️ 旅遊行程管理</div>
          <button class="btn-save" onclick="document.getElementById('addTourModal').classList.add('open')">+ 新增行程</button>
        </div>
        <div class="card-body" style="padding:0;overflow-x:auto">
          <table>
            <thead><tr><th>行程名稱</th><th>標籤</th><th>天數</th><th>精選</th><th>操作</th></tr></thead>
            <tbody>${toursTableRows || '<tr><td colspan="5" style="text-align:center;color:#7a6e62;padding:2rem">尚無行程，請新增。</td></tr>'}</tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- SITE SETTINGS -->
    <div class="panel" id="panel-site">
      <div class="card">
        <div class="card-header"><div class="card-title">⚙️ 網站設定</div></div>
        <div class="card-body">
          <form method="POST" action="/admin/site">
            <div class="fg"><label>公司名稱</label><input type="text" name="name" value="${esc(data.site.name)}"></div>
            <div class="fg"><label>首頁主標語</label><input type="text" name="tagline" value="${esc(data.site.tagline)}"></div>
            <div class="fg"><label>首頁副標語</label><input type="text" name="subtagline" value="${esc(data.site.subtagline)}"></div>
            <div class="fg"><label>首頁說明文字</label><textarea name="heroText">${esc(data.site.heroText)}</textarea></div>
            <button type="submit" class="btn-save">儲存設定</button>
          </form>
        </div>
      </div>
    </div>

    <!-- CONTACT -->
    <div class="panel" id="panel-contact">
      <div class="card">
        <div class="card-header"><div class="card-title">📞 聯絡資訊</div></div>
        <div class="card-body">
          <form method="POST" action="/admin/contact">
            <div class="frow">
              <div class="fg"><label>電話</label><input type="text" name="phone" value="${esc(data.contact.phone)}"></div>
              <div class="fg"><label>傳真</label><input type="text" name="fax" value="${esc(data.contact.fax)}"></div>
            </div>
            <div class="fg"><label>地址</label><input type="text" name="address" value="${esc(data.contact.address)}"></div>
            <div class="fg"><label>電子郵件</label><input type="email" name="email" value="${esc(data.contact.email)}"></div>
            <div class="frow">
              <div class="fg"><label>統一編號</label><input type="text" name="regnum" value="${esc(data.contact.regnum)}"></div>
              <div class="fg"><label>營業時間</label><input type="text" name="hours" value="${esc(data.contact.hours)}"></div>
            </div>
            <button type="submit" class="btn-save">儲存資訊</button>
          </form>
        </div>
      </div>
    </div>

    <!-- VISA -->
    <div class="panel" id="panel-visa">
      <div class="card">
        <div class="card-header"><div class="card-title">🛂 簽證說明文字</div></div>
        <div class="card-body">
          <form method="POST" action="/admin/visa">
            <div class="fg"><label>簽證頁說明</label><textarea name="visa_info" style="min-height:160px">${esc(data.visa_info)}</textarea></div>
            <button type="submit" class="btn-save">儲存簽證說明</button>
          </form>
        </div>
      </div>
    </div>

    <!-- ANNOUNCE -->
    <div class="panel" id="panel-announce">
      <div class="card">
        <div class="card-header">
          <div class="card-title">📢 公告管理</div>
          <button class="btn-save" onclick="document.getElementById('addAnnModal').classList.add('open')">+ 新增公告</button>
        </div>
        <div class="card-body" style="padding:0;overflow-x:auto">
          <table>
            <thead><tr><th>公告內容</th><th>狀態</th><th>操作</th></tr></thead>
            <tbody>${annRows || '<tr><td colspan="3" style="text-align:center;color:#7a6e62;padding:2rem">尚無公告。</td></tr>'}</tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- PASSWORD -->
    <div class="panel" id="panel-password">
      <div class="card">
        <div class="card-header"><div class="card-title">🔒 更改密碼</div></div>
        <div class="card-body">
          <form method="POST" action="/admin/password">
            <div class="fg"><label>目前密碼</label><input type="password" name="current" placeholder="輸入目前密碼"></div>
            <div class="fg"><label>新密碼</label><input type="password" name="newpass" placeholder="長度至少6字"></div>
            <div class="fg"><label>確認新密碼</label><input type="password" name="confirm" placeholder="再次輸入新密碼"></div>
            <button type="submit" class="btn-save">更改密碼</button>
          </form>
        </div>
      </div>
    </div>
  </main>
</div>

<!-- ADD TOUR MODAL -->
<div class="modal-overlay" id="addTourModal">
  <div class="modal">
    <div class="modal-header"><h3>✈️ 新增旅遊行程</h3><button class="modal-close" onclick="document.getElementById('addTourModal').classList.remove('open')">✕</button></div>
    <form method="POST" action="/admin/tours/add" enctype="multipart/form-data">
      <div class="modal-body">
        <div class="fg"><label>行程名稱 *</label><input type="text" name="name" required placeholder="例：泰國北碧6日"></div>
        <div class="frow">
          <div class="fg"><label>標籤</label><input type="text" name="tag" placeholder="例：泰國、日本"></div>
          <div class="fg"><label>天數</label><input type="text" name="duration" placeholder="例：6天5夜"></div>
        </div>
        <div class="frow">
          <div class="fg"><label>出發日期</label><input type="text" name="departDate" placeholder="例：2025-06-30"></div>
          <div class="fg"><label>費用報價</label><input type="text" name="price" placeholder="例：NT$31,500起"></div>
        </div>
        <div class="fg"><label>行程簡介</label><textarea name="description" placeholder="一段吸引人的行程介紹…"></textarea></div>
        <div class="fg">
          <label>每日行程（一行一天，格式：第N天標題 | 行程說明 | 早餐,午餐,晚餐 | 住宿）</label>
          <textarea name="schedule" style="min-height:140px;font-family:monospace;font-size:.82rem" placeholder="第1天 高雄→曼谷 | 抵達曼谷後前往夜市 | 午餐：機上,晚餐：BBQ | Thaya Hotel Bangkok
第2天 曼谷→北碧 | 桂河大橋、大象洗澡 | 早餐：飯店,午餐：泰式,晚餐：Mookata | Mida Resort"></textarea>
          <div class="schedule-hint">💡 格式：標題 | 說明 | 餐食（用逗號分隔） | 住宿 — 每行一天</div>
        </div>
        <div class="fg"><label>參考航班（可自由格式輸入）</label><textarea name="flights" placeholder="泰國航空 TG631：高雄→曼谷 17:15起飛，19:55抵達&#10;泰國航空 TG630：曼谷→高雄 11:45起飛，16:15抵達"></textarea></div>
        <div class="frow">
          <div class="fg"><label>費用包含（每行一項）</label><textarea name="includes" style="min-height:90px" placeholder="航空來回機票&#10;全程住宿及餐食&#10;行程所有門票及車資"></textarea></div>
          <div class="fg"><label>費用不含（每行一項）</label><textarea name="excludes" style="min-height:90px" placeholder="護照及簽證費&#10;個人消費&#10;導遊小費"></textarea></div>
        </div>
        <div class="fg"><label>訂金金額</label><input type="text" name="deposit" placeholder="例：10,000"></div>
        <div class="fg">
          <label>上傳行程表檔案（PDF 或 Word，將直接顯示在網站上）</label>
          <input type="file" name="scheduleFile" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" style="padding:.5rem;background:#fdf9f4">
          <div class="schedule-hint">💡 上傳後，行程安排頁面會直接顯示此檔案。PDF 可在網頁內嵌顯示；Word 檔提供下載按鈕。</div>
        </div>
        <div class="fg"><label>行程圖片（封面照片）</label><input type="file" name="image" accept="image/*" style="padding:.5rem;background:#fdf9f4"></div>
        <div class="check-row"><input type="checkbox" name="featured" id="feat-add"><label for="feat-add">設為精選行程（顯示在首頁）</label></div>
      </div>
      <div class="modal-foot">
        <button type="button" class="btn-cancel" onclick="document.getElementById('addTourModal').classList.remove('open')">取消</button>
        <button type="submit" class="btn-save">新增行程</button>
      </div>
    </form>
  </div>
</div>

<!-- EDIT TOUR MODAL -->
<div class="modal-overlay" id="editTourModal">
  <div class="modal">
    <div class="modal-header"><h3>✏️ 編輯旅遊行程</h3><button class="modal-close" onclick="document.getElementById('editTourModal').classList.remove('open')">✕</button></div>
    <form method="POST" id="editTourForm" enctype="multipart/form-data">
      <div class="modal-body">
        <div class="fg"><label>行程名稱 *</label><input type="text" name="name" id="et-name" required></div>
        <div class="frow">
          <div class="fg"><label>標籤</label><input type="text" name="tag" id="et-tag"></div>
          <div class="fg"><label>天數</label><input type="text" name="duration" id="et-dur"></div>
        </div>
        <div class="frow">
          <div class="fg"><label>出發日期</label><input type="text" name="departDate" id="et-date"></div>
          <div class="fg"><label>費用報價</label><input type="text" name="price" id="et-price"></div>
        </div>
        <div class="fg"><label>行程簡介</label><textarea name="description" id="et-desc"></textarea></div>
        <div class="fg">
          <label>每日行程（一行一天，格式：標題 | 說明 | 餐食 | 住宿）</label>
          <textarea name="schedule" id="et-schedule" style="min-height:140px;font-family:monospace;font-size:.82rem"></textarea>
          <div class="schedule-hint">💡 格式：標題 | 說明 | 餐食（逗號分隔） | 住宿 — 每行一天</div>
        </div>
        <div class="fg"><label>參考航班</label><textarea name="flights" id="et-flights"></textarea></div>
        <div class="frow">
          <div class="fg"><label>費用包含（每行一項）</label><textarea name="includes" id="et-includes" style="min-height:90px"></textarea></div>
          <div class="fg"><label>費用不含（每行一項）</label><textarea name="excludes" id="et-excludes" style="min-height:90px"></textarea></div>
        </div>
        <div class="fg"><label>訂金金額</label><input type="text" name="deposit" id="et-deposit"></div>
        <div class="fg">
          <label>更換行程表檔案（選填 · PDF 或 Word）</label>
          <input type="file" name="scheduleFile" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" style="padding:.5rem;background:#fdf9f4">
          <div id="et-schedule-file-info" style="display:none;font-size:.78rem;color:#c8963e;margin-top:.3rem;padding:.4rem .7rem;background:#fdf9f4;border:1px solid #e0d8cc;border-radius:3px"></div>
          <div class="schedule-hint">💡 上傳新檔案才會取代舊檔案，不上傳則保留原檔案。</div>
        </div>
        <div class="fg"><label>更換圖片（選填）</label><input type="file" name="image" accept="image/*" style="padding:.5rem;background:#fdf9f4"></div>
        <div class="check-row"><input type="checkbox" name="featured" id="et-feat"><label for="et-feat">設為精選行程（顯示在首頁）</label></div>
      </div>
      <div class="modal-foot">
        <button type="button" class="btn-cancel" onclick="document.getElementById('editTourModal').classList.remove('open')">取消</button>
        <button type="submit" class="btn-save">儲存更新</button>
      </div>
    </form>
  </div>
</div>

<!-- ADD ANNOUNCEMENT MODAL -->
<div class="modal-overlay" id="addAnnModal">
  <div class="modal">
    <div class="modal-header"><h3>📢 公告</h3><button class="modal-close" onclick="document.getElementById('addAnnModal').classList.remove('open')">✕</button></div>
    <form method="POST" action="/admin/announcement" id="annForm">
      <input type="hidden" name="annoId" id="ann-id" value="">
      <div class="modal-body">
        <div class="fg"><label>公告內容</label><input type="text" name="text" id="ann-text" placeholder="例：🌏 2025暑假行程報名中，名額有限！" required></div>
        <div class="check-row"><input type="checkbox" name="active" id="ann-active" checked><label for="ann-active">立即顯示在網站上</label></div>
      </div>
      <div class="modal-foot">
        <button type="button" class="btn-cancel" onclick="document.getElementById('addAnnModal').classList.remove('open')">取消</button>
        <button type="submit" class="btn-save">儲存公告</button>
      </div>
    </form>
  </div>
</div>

<script>
// Panel navigation
function show(id){
  document.querySelectorAll('.panel').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.sidebar-item').forEach(b=>b.classList.remove('active'));
  document.getElementById('panel-'+id).classList.add('active');
  event.currentTarget.classList.add('active');
}

// Check for saved query param
const p=new URLSearchParams(location.search);
if(p.get('saved')){
  const t=document.getElementById('toast');
  t.textContent='✅ 儲存成功！';t.style.display='block';
  setTimeout(()=>t.style.display='none',3000);
  const map={site:'site',contact:'contact',tour:'tours',visa:'visa',announcement:'announce',password:'password'};
  const sec=map[p.get('saved')];
  if(sec){
    document.querySelectorAll('.panel').forEach(p=>p.classList.remove('active'));
    document.querySelectorAll('.sidebar-item').forEach(b=>b.classList.remove('active'));
    document.getElementById('panel-'+sec).classList.add('active');
    const btn=document.querySelector('[onclick="show(\\''+sec+'\\')"]');
    if(btn)btn.classList.add('active');
  }
  history.replaceState(null,'','/admin');
}

// Convert schedule array to plain text for textarea
function scheduleToText(arr){
  if(!arr||!arr.length)return '';
  try{
    const parsed=typeof arr==='string'?JSON.parse(arr):arr;
    if(Array.isArray(parsed)){
      return parsed.map(d=>[d.title||'',d.desc||'',d.meals||'',d.hotel||''].join(' | ')).join('\n');
    }
  }catch(e){}
  return typeof arr==='string'?arr:'';
}

// Edit tour modal
function openEditModal(id,name,tag,dur,desc,price,date,schedule,flights,includes,excludes,deposit,scheduleFile,feat){
  document.getElementById('editTourForm').action='/admin/tours/edit/'+id;
  document.getElementById('et-name').value=name;
  document.getElementById('et-tag').value=tag;
  document.getElementById('et-dur').value=dur;
  document.getElementById('et-desc').value=desc.replace(/\\n/g,'\n');
  document.getElementById('et-price').value=price;
  document.getElementById('et-date').value=date;
  document.getElementById('et-schedule').value=scheduleToText(schedule);
  document.getElementById('et-flights').value=flights.replace(/\\n/g,'\n');
  document.getElementById('et-includes').value=includes.replace(/\\n/g,'\n');
  document.getElementById('et-excludes').value=excludes.replace(/\\n/g,'\n');
  document.getElementById('et-deposit').value=deposit;
  document.getElementById('et-feat').checked=feat;
  // Show current schedule file info
  const sfInfo = document.getElementById('et-schedule-file-info');
  if(sfInfo){
    if(scheduleFile){
      const fname = scheduleFile.split('/').pop();
      sfInfo.innerHTML = '目前已上傳：<strong>'+fname+'</strong>（不上傳新檔案則保留）';
      sfInfo.style.display='block';
    } else {
      sfInfo.innerHTML='';
      sfInfo.style.display='none';
    }
  }
  document.getElementById('editTourModal').classList.add('open');
}

// Announcement modal
function openAnnModal(id,text,active){
  document.getElementById('ann-id').value=id;
  document.getElementById('ann-text').value=text;
  document.getElementById('ann-active').checked=active;
  document.getElementById('addAnnModal').classList.add('open');
}

// Close modals on overlay click
document.querySelectorAll('.modal-overlay').forEach(m=>{
  m.addEventListener('click',e=>{if(e.target===m)m.classList.remove('open')});
});
</script>
</body></html>`;
}

// ── LOGIN PAGE ────────────────────────────────────────────────────────────────
function renderLogin(error) {
  return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>管理員登入 · 喜程旅行社</title>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;600&family=Playfair+Display:wght@400&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Noto Sans TC',sans-serif;background:linear-gradient(135deg,#1a1410 0%,#3a2a18 100%);min-height:100vh;display:flex;align-items:center;justify-content:center}
.box{background:#fff;width:380px;border-radius:6px;overflow:hidden;box-shadow:0 30px 80px rgba(0,0,0,.4)}
.box-top{background:#1a1410;padding:2.5rem 2rem;text-align:center}
.box-logo{font-family:'Playfair Display',serif;font-size:1.5rem;color:#f7f3ed}.box-logo span{color:#c8963e}
.box-sub{font-size:.75rem;letter-spacing:.15em;text-transform:uppercase;color:rgba(247,243,237,.5);margin-top:.4rem}
.box-body{padding:2rem}
.err{background:#ffee8;border:1px solid #f0c0a8;color:#c33;padding:.7rem 1rem;border-radius:3px;font-size:.85rem;margin-bottom:1.2rem}
label{display:block;font-size:.75rem;text-transform:uppercase;letter-spacing:.1em;color:#7a6e62;margin-bottom:.35rem;font-weight:600}
input[type=password]{width:100%;padding:.75rem 1rem;border:1px solid #d4c4a8;border-radius:3px;font-size:.95rem;outline:none;transition:border-color .2s;font-family:inherit}
input[type=password]:focus{border-color:#c8963e}
.fg{margin-bottom:1.2rem}
button{width:100%;background:#c8963e;color:#1a1410;border:none;padding:.85rem;border-radius:3px;font-size:.88rem;font-weight:700;cursor:pointer;font-family:inherit;letter-spacing:.05em;transition:background .2s;margin-top:.3rem}
button:hover{background:#e8c87a}
.hint{text-align:center;margin-top:1rem;font-size:.78rem;color:#a09080}
</style>
</head>
<body>
<div class="box">
  <div class="box-top">
    <div class="box-logo">喜程<span>旅行社</span></div>
    <div class="box-sub">管理後台 · Admin Panel</div>
  </div>
  <div class="box-body">
    ${error ? `<div class="err">⚠️ ${esc(error)}</div>` : ''}
    <form method="POST" action="/admin/login">
      <div class="fg"><label>管理員密碼</label><input type="password" name="password" placeholder="輸入密碼" autofocus></div>
      <button type="submit">進入管理後台</button>
    </form>
    <p class="hint">預設密碼：seetrip2025<br>登入後請至「更改密碼」修改。</p>
  </div>
</div>
</body></html>`;
}
