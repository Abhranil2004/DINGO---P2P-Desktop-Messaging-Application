<p align="center">
  <img src="https://github.com/Abhranil2004/DINGO---P2P-Desktop-Messaging-Application/blob/general/src-tauri/icons/Dingo.png" alt="Dingo Logo" width="200"/>
</p>

# DINGO  
### Secure P2P Desktop Messaging Built with Rust + React

![Tauri](https://img.shields.io/badge/Tauri-v2-orang)
![React](https://img.shields.io/badge/React-19-61dafb)
![Rust](https://img.shields.io/badge/Rust-stable-ce422b)
![License](https://img.shields.io/badge/license-MIT-blue)

> Fast. Secure. Lightweight.  
> A modern peer-to-peer messaging experience — without centralized servers.

---

## ✨ Why DINGO?

DINGO is a secure, lightweight desktop messaging application that connects peers directly using LAN or WebRTC.

No heavy Chromium bundling.  
No cloud dependency required.  
No unnecessary background services.  

Built with **Tauri + Rust**, DINGO delivers native performance with modern UI.

---

## 🚀 Core Features

### 🔐 End-to-End Encryption
- X25519 key exchange
- AES-GCM-256 message encryption
- Secure peer sessions

### 💬 Real-Time Messaging
- Instant delivery
- Read receipts
- Offline message sync

### 📁 File Transfer
- Chunked file sending
- Resume support
- Automatic download handling

### 📺 Screen Sharing
- Native Rust screen capture
- Optimized streaming

### 🔍 LAN Discovery
- Auto peer detection
- Zero manual configuration

### 👥 Group Chat
- Multi-user messaging
- Group member management

### 📝 Notes & Productivity
- Save notes locally
- Pin important messages

---

## 🖥 Screenshots

<p align="center">
  <img src="https://github.com/Abhranil2004/DINGO---P2P-Desktop-Messaging-Application/blob/general/src-tauri/Screenshorts/1.png" width="600"/>
</p>

<p align="center">
  <img src="https://github.com/Abhranil2004/DINGO---P2P-Desktop-Messaging-Application/blob/general/src-tauri/Screenshorts/2.png" width="600"/>
</p>
---
## 🏗 Architecture

```
┌───────────────────────────┐
│        React UI           │
│  • Components             │
│  • State Management       │
│  • WebRTC Client          │
└──────────────┬────────────┘
               │ IPC Bridge
┌──────────────┴────────────┐
│        Tauri Core         │
└──────────────┬────────────┘
               │
┌──────────────┴────────────┐
│        Rust Backend       │
│  • Encryption Engine      │
│  • SQLite Database        │
│  • File Transfer          │
│  • Screen Capture         │
│  • Peer Discovery         │
└───────────────────────────┘
```

---

## ⚙ Technology Stack

| Layer           | Technology       |
| --------------- | ---------------- |
| UI              | React 19         |
| Build Tool      | Vite             |
| Desktop Runtime | Tauri v2         |
| Backend         | Rust             |
| Database        | SQLite           |
| Encryption      | AES-GCM + X25519 |
| Networking      | WebRTC + HTTP    |

---

## 🛠 Installation Guide

### 1️⃣ Install Requirements

* Node.js (18+)
* Rust (stable)
* pnpm
* Microsoft C++ Build Tools (Windows)
* WebView2 Runtime

---

### 2️⃣ Clone Repository

```bash
git clone https://github.com/YOUR_USERNAME/dingo.git
cd dingo
```

---

### 3️⃣ Install Dependencies

```bash
pnpm install
```

---

### 4️⃣ Run Development Mode

```bash
pnpm tauri dev
```

---

## 📦 Build Production EXE

```bash
pnpm tauri build
```

Windows output:

```
src-tauri/target/release/bundle/nsis/
```

---

## 📁 Project Structure

```
dingo/
├── src/                 # React frontend
├── src-tauri/           # Rust backend
├── public/
├── dist/
├── package.json
└── README.md
```

---

## 🔐 Security Design

* Zero centralized server required
* Peer-to-peer encrypted sessions
* Local SQLite storage
* No message logging on third-party services

---

## 🧪 Development Commands

```bash
pnpm tauri dev
pnpm tauri build
pnpm tauri info
```

If EXE is locked:

```powershell
taskkill /F /IM dingo.exe
```

---

## 🚀 Roadmap

* [ ] Voice & Video Calls
* [ ] Cross-platform release (macOS/Linux)
* [ ] Message search
* [ ] Emoji reactions
* [ ] Dark mode themes
* [ ] Cloud relay server option

---

## 👨‍💻 Creator

**Abhranil Dutta**

