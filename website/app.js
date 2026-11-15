// ================================================================
// DINGO — Installation Website Interactive Scripts
// ================================================================

document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initCopySha();
  initInteractiveChat();
  initFlightCanvas();
  initConfettiDownload();
});

// ── 1. Theme Switcher (Light / Dark) ───────────────────────────
function initTheme() {
  const toggleBtn = document.getElementById('theme-toggle');
  const icon = toggleBtn.querySelector('.theme-icon');
  
  const savedTheme = localStorage.getItem('dingo_web_theme') || 'dark';
  document.documentElement.className = savedTheme;
  document.body.className = savedTheme;
  icon.textContent = savedTheme === 'dark' ? '☀️' : '🌙';

  toggleBtn.addEventListener('click', () => {
    const isDark = document.body.classList.contains('dark') || document.documentElement.classList.contains('dark');
    const newTheme = isDark ? 'light' : 'dark';
    document.documentElement.className = newTheme;
    document.body.className = newTheme;
    icon.textContent = newTheme === 'dark' ? '☀️' : '🌙';
    localStorage.setItem('dingo_web_theme', newTheme);
  });
}

// ── 2. One-Click Checksum Copy ─────────────────────────────────
function initCopySha() {
  const copyBtn = document.getElementById('copy-sha-btn');
  const shaText = document.getElementById('sha-text');

  copyBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(shaText.textContent.trim()).then(() => {
      const original = copyBtn.textContent;
      copyBtn.textContent = 'Copied!';
      copyBtn.style.background = 'var(--accent-lime)';
      setTimeout(() => {
        copyBtn.textContent = original;
        copyBtn.style.background = '';
      }, 2000);
    });
  });
}

// ── 3. Interactive P2P Demo Simulator ──────────────────────────
function initInteractiveChat() {
  const form = document.getElementById('demo-form');
  const input = document.getElementById('demo-input');
  const chatBody = document.getElementById('demo-chat-body');

  const peerReplies = [
    "⚡ Received instantly via direct WebRTC DataChannel! Notice the 0.2ms latency.",
    "🔒 Verified end-to-end encrypted with X25519 & AES-256-GCM. Cloudflare never saw that!",
    "🚀 Zero cloud servers. Just device-to-device transport between our PCs.",
    "📁 You can also drop 50GB video files directly across the room or over the internet!",
    "🌐 Dingo automatically negotiated STUN NAT traversal for our connection."
  ];
  let replyIdx = 0;

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;

    // 1. Add user message
    appendMessage({
      sender: '@alex_dev (You)',
      avatar: 'A',
      isMe: true,
      text: text,
      meta: '0.1ms • WebRTC Direct'
    });
    input.value = '';

    // 2. Simulate P2P peer reply with realistic latency
    const typingIndicator = document.createElement('div');
    typingIndicator.className = 'demo-msg msg-peer';
    typingIndicator.innerHTML = `
      <div class="demo-avatar">S</div>
      <div class="demo-bubble" style="font-style: italic; opacity: 0.7;">
        @sarah_design is streaming P2P packet…
      </div>
    `;
    chatBody.appendChild(typingIndicator);
    chatBody.scrollTop = chatBody.scrollHeight;

    setTimeout(() => {
      typingIndicator.remove();
      const reply = peerReplies[replyIdx % peerReplies.length];
      replyIdx++;
      appendMessage({
        sender: '@sarah_design',
        avatar: 'S',
        isMe: false,
        text: reply,
        meta: `${(Math.random() * 0.4 + 0.1).toFixed(1)}ms • P2P Stream Verified`
      });
    }, 600);
  });

  function appendMessage({ sender, avatar, isMe, text, meta }) {
    const msg = document.createElement('div');
    msg.className = `demo-msg ${isMe ? 'msg-me' : 'msg-peer'}`;
    msg.innerHTML = `
      <div class="demo-avatar ${isMe ? 'me' : ''}">${avatar}</div>
      <div class="demo-bubble ${isMe ? 'me' : ''}">
        <div class="demo-sender ${isMe ? 'me' : ''}">${sender}</div>
        ${escapeHtml(text)}
        <div class="demo-meta ${isMe ? 'me' : ''}">${meta}</div>
      </div>
    `;
    chatBody.appendChild(msg);
    chatBody.scrollTop = chatBody.scrollHeight;
  }

  function escapeHtml(str) {
    const p = document.createElement('p');
    p.textContent = str;
    return p.innerHTML;
  }
}

// ── 4. Interactive Flight Canvas & Sparkle Trails ──────────────
function initFlightCanvas() {
  const canvas = document.getElementById('flight-canvas');
  const ctx = canvas.getContext('2d');

  let width = canvas.width = window.innerWidth;
  let height = canvas.height = window.innerHeight;

  window.addEventListener('resize', () => {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
  });

  // Animated background paper planes
  const planes = [
    { x: -50, y: height * 0.25, vx: 1.2, vy: 0.2, angle: 0.1, size: 28, color: '#c6f135' },
    { x: width + 50, y: height * 0.65, vx: -0.9, vy: -0.15, angle: 3.2, size: 22, color: '#7059e2' },
    { x: width * 0.2, y: height + 50, vx: 0.6, vy: -1.0, angle: -1.1, size: 20, color: '#ff7597' }
  ];

  // Mouse particle trail
  const particles = [];
  window.addEventListener('mousemove', (e) => {
    if (Math.random() < 0.4) {
      particles.push({
        x: e.clientX,
        y: e.clientY,
        vx: (Math.random() - 0.5) * 1.5,
        vy: (Math.random() - 0.5) * 1.5,
        size: Math.random() * 4 + 2,
        color: ['#c6f135', '#7059e2', '#ffd128', '#ff7597'][Math.floor(Math.random() * 4)],
        life: 1.0
      });
    }
  });

  function drawPlane(p) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.angle);
    
    // Draw minimalist paper plane silhouette
    ctx.fillStyle = p.color;
    ctx.strokeStyle = '#12131a';
    ctx.lineWidth = 2;

    ctx.beginPath();
    ctx.moveTo(p.size, 0);
    ctx.lineTo(-p.size * 0.8, -p.size * 0.6);
    ctx.lineTo(-p.size * 0.4, 0);
    ctx.lineTo(-p.size * 0.8, p.size * 0.6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Center fold
    ctx.beginPath();
    ctx.moveTo(p.size, 0);
    ctx.lineTo(-p.size * 0.4, 0);
    ctx.stroke();

    ctx.restore();
  }

  function loop() {
    ctx.clearRect(0, 0, width, height);

    // Update & draw background planes
    for (const p of planes) {
      p.x += p.vx;
      p.y += p.vy;

      if (p.x > width + 100) p.x = -100;
      if (p.x < -100) p.x = width + 100;
      if (p.y > height + 100) p.y = -100;
      if (p.y < -100) p.y = height + 100;

      drawPlane(p);
    }

    // Update & draw mouse sparkles
    for (let i = particles.length - 1; i >= 0; i--) {
      const pt = particles[i];
      pt.x += pt.vx;
      pt.y += pt.vy;
      pt.life -= 0.025;

      if (pt.life <= 0) {
        particles.splice(i, 1);
        continue;
      }

      ctx.save();
      ctx.globalAlpha = pt.life;
      ctx.fillStyle = pt.color;
      ctx.fillRect(pt.x, pt.y, pt.size, pt.size);
      ctx.restore();
    }

    requestAnimationFrame(loop);
  }
  loop();
}

// ── 5. Confetti Burst on Download ──────────────────────────────
function initConfettiDownload() {
  const downloadBtn = document.getElementById('main-download-btn');
  if (!downloadBtn) return;

  // Local vs Remote fallback detection
  if (window.location.protocol === 'file:' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    downloadBtn.setAttribute('href', 'Dingo_1.0.1_x64-setup.exe');
    const portableBtn = document.querySelector('.btn-hero-portable');
    if (portableBtn) portableBtn.setAttribute('href', 'Dingo.exe');
  }

  downloadBtn.addEventListener('click', (e) => {
    // Generate vibrant brutalist confetti squares
    const colors = ['#c6f135', '#7059e2', '#ffd128', '#ff7597', '#00e5ff'];
    const count = 40;
    const rect = downloadBtn.getBoundingClientRect();
    const originX = rect.left + rect.width / 2;
    const originY = rect.top + rect.height / 2;

    for (let i = 0; i < count; i++) {
      const conf = document.createElement('div');
      const size = Math.random() * 10 + 8;
      const color = colors[Math.floor(Math.random() * colors.length)];
      
      conf.style.position = 'fixed';
      conf.style.left = `${originX}px`;
      conf.style.top = `${originY}px`;
      conf.style.width = `${size}px`;
      conf.style.height = `${size}px`;
      conf.style.backgroundColor = color;
      conf.style.border = '2px solid #12131a';
      conf.style.pointerEvents = 'none';
      conf.style.zIndex = '99999';
      conf.style.transition = 'transform 1s cubic-bezier(0.16, 1, 0.3, 1), opacity 1s ease';

      document.body.appendChild(conf);

      const destX = (Math.random() - 0.5) * 500;
      const destY = (Math.random() - 0.9) * 400;
      const rotation = (Math.random() - 0.5) * 720;

      requestAnimationFrame(() => {
        conf.style.transform = `translate(${destX}px, ${destY}px) rotate(${rotation}deg)`;
        conf.style.opacity = '0';
      });

      setTimeout(() => conf.remove(), 1200);
    }
  });
}
