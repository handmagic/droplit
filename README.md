# 💧 DropLit v0.4.3

**Voice-first idea capture app by Syntrise**

> ⚡ JUST TAP TO KEEP YOUR IDEA ⚡

---

## 📁 Project Structure

```
droplit/
├── index.html          ← Main app (all-in-one)
├── manifest.json       ← PWA manifest
├── sw.js              ← Service Worker (offline support)
├── icons/             ← App icons (see below)
│   ├── icon-192.png
│   ├── icon-512.png
│   └── ...
├── versions/          ← Version archive
│   └── v0.4.3.html
└── README.md          ← This file
```

---

## 🚀 DEPLOY TO VERCEL

### Step 1: Create GitHub Repository

1. Go to https://github.com/handmagic
2. Click **"New"** (green button)
3. Repository name: `droplit`
4. Keep it **Public** (for free Vercel hosting)
5. Click **"Create repository"**

### Step 2: Upload Files

**Option A: Drag & Drop (easiest)**
1. On the new repo page, click **"uploading an existing file"**
2. Drag all files from this package:
   - `index.html`
   - `manifest.json`
   - `sw.js`
   - `icons/` folder
3. Commit message: "DropLit v0.4.3 initial"
4. Click **"Commit changes"**

**Option B: Git command line**
```bash
git clone https://github.com/handmagic/droplit.git
cd droplit
# Copy all files here
git add .
git commit -m "DropLit v0.4.3"
git push origin main
```

### Step 3: Connect Vercel

1. Go to https://vercel.com
2. Click **"Sign Up"** → **"Continue with GitHub"**
3. Authorize Vercel
4. Click **"Add New..."** → **"Project"**
5. Find `handmagic/droplit` → Click **"Import"**
6. Settings (keep defaults):
   - Framework Preset: **Other**
   - Root Directory: **./`**
7. Click **"Deploy"**
8. Wait ~30 seconds...
9. 🎉 **Done!** You'll get URL like: `https://droplit-xxxx.vercel.app`

### Step 4: Custom Domain (optional)

1. In Vercel project → **Settings** → **Domains**
2. Add `droplit.app` (when you buy it)
3. Follow DNS instructions

---

## 📱 INSTALL ON ANDROID

1. Open your Vercel URL in **Chrome** on Android
2. Wait 3 seconds — you'll see **"Install DropLit"** prompt
3. Tap **"Install"**
4. Done! App icon appears on home screen

**Manual install:**
1. Open URL in Chrome
2. Tap **⋮** (menu) → **"Add to Home screen"**
3. Tap **"Add"**

---

## 🔄 HOW TO UPDATE

1. Edit `index.html` locally
2. Test in Chrome
3. When ready, push to GitHub:
   - Go to repo → `index.html` → Edit (pencil icon)
   - Paste new content
   - Commit
4. Vercel auto-deploys in ~30 seconds!

---

## 📋 VERSION HISTORY

| Version | Date | Changes |
|---------|------|---------|
| v0.4.3 | 2024-12-22 | PWA support, soft stripes, mobile-ready |
| v0.4.2 | 2024-12-22 | Category change modal, emoji slogan |
| v0.4.1 | 2024-12-22 | KEEP slogan, centered filters |
| v0.4.0 | 2024-12-22 | Color coding, time filters |
| v0.3.3 | 2024-12-22 | Reversed feed, delete confirmation |

---

## ⚠️ ICONS NEEDED

You need to create/upload icons. Minimum required:
- `icons/icon-192.png` (192×192px)
- `icons/icon-512.png` (512×512px)

**Quick solution:** Use emoji-to-png converter:
1. Go to https://emoji.aranja.com
2. Enter: 💧
3. Download as PNG
4. Resize to 192×192 and 512×512

**Or use placeholder:**
Create simple colored squares with "💧" text.

---

## 🔗 LINKS

- **Live App:** https://droplit-xxxx.vercel.app (your URL)
- **GitHub:** https://github.com/handmagic/droplit
- **Company:** https://syntrise.com

---

## 📄 LICENSE

© 2024 Syntrise Inc. All rights reserved.

---

Made with 💧 by Syntrise
