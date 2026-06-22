// =============================================
// GAME — game.html
// Token system: $1 = 3 tokens, 1 spin = 1 token
// Every spin result gets a unique tamper-proof ID
// =============================================
import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  doc, getDoc, updateDoc, increment,
  collection, addDoc, getDocs, query,
  orderBy, limit, serverTimestamp, runTransaction,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// =============================================
// GAME DATA — Edit prizes here
// Each prizes array must have exactly 8 items
// =============================================
const CATEGORIES = [
  {
    id: "bronze", name: "Bronze", icon: "🥉", cls: "bronze", cost: 1, tag: "Starter",
    sections: [
      { name: "Common", prizes: ["5 WM","10 WM","Discount 5%","Mystery Box","Free Token","2 WM","8 WM","Nothing"] },
      { name: "Rare",   prizes: ["15 WM","20 WM","Voucher S","Gift Card","Token x2","12 WM","18 WM","Nothing"] },
      { name: "Epic",   prizes: ["30 WM","25 WM","Mystery Pack","Lucky Bag","Bonus Token","22 WM","28 WM","Nothing"] },
    ]
  },
  {
    id: "silver", name: "Silver", icon: "🥈", cls: "silver", cost: 1, tag: "Popular",
    sections: [
      { name: "Common", prizes: ["20 WM","35 WM","Voucher M","Silver Box","Free Token","15 WM","40 WM","Nothing"] },
      { name: "Rare",   prizes: ["50 WM","60 WM","Gift Set","Gold Token","Token x2","45 WM","55 WM","Nothing"] },
      { name: "Epic",   prizes: ["80 WM","70 WM","Mega Pack","Silver Key","Bonus Token","65 WM","75 WM","Nothing"] },
    ]
  },
  {
    id: "gold", name: "Gold", icon: "🥇", cls: "gold", cost: 1, tag: "Premium",
    sections: [
      { name: "Common", prizes: ["80 WM","100 WM","Gold Box","Voucher L","Free Token","60 WM","90 WM","Nothing"] },
      { name: "Rare",   prizes: ["150 WM","200 WM","Rare Key","Jackpot x2","Token x3","120 WM","180 WM","Nothing"] },
      { name: "Epic",   prizes: ["500 WM","300 WM","Grand Prize","Mega Jackpot","Jackpot Token","250 WM","400 WM","Nothing"] },
    ]
  }
];

const WHEEL_COLORS = {
  bronze: ["#c97a40","#a85e2e","#b86c38","#da8a50","#965228","#c07040","#d08848","#7a3e1e"],
  silver: ["#a8b4cc","#8090a8","#98a4bc","#c0ccdc","#687080","#90a0b4","#b0bcd0","#586070"],
  gold:   ["#f4c430","#d0a020","#e0b028","#ffd040","#b08018","#e8b830","#f0c840","#a07010"],
};

// =============================================
// STATE
// =============================================
let currentUser = null;
let userData    = null;
let selectedCat = 0;
let selectedSec = 0;
let spinning    = false;
let spinAngle   = 0;
let unsubUser   = null;

// =============================================
// AUTH GUARD
// =============================================
onAuthStateChanged(auth, async (user) => {
  if (!user) { window.location.href = "index.html"; return; }
  currentUser = user;
  const snap = await getDoc(doc(db, "users", user.uid));
  if (!snap.exists()) { window.location.href = "index.html"; return; }
  userData = snap.data();
  document.getElementById("nav-username").textContent = userData.username;
  subscribeUser();
  renderCategories();
  renderSections();
  updateCostDisplay();
  drawWheel();

  // wire up funds input live preview
  document.getElementById("funds-amount").addEventListener("input", updateTokenPreview);
});

// =============================================
// REAL-TIME USER DATA (tokens + balance)
// =============================================
function subscribeUser() {
  if (unsubUser) unsubUser();
  unsubUser = onSnapshot(doc(db, "users", currentUser.uid), (snap) => {
    if (!snap.exists()) return;
    userData = snap.data();
    document.getElementById("nav-tokens").textContent  = userData.tokens  ?? 0;
    document.getElementById("nav-balance").textContent = (userData.balance ?? 0).toFixed(2);
  });
}

// =============================================
// LOGOUT
// =============================================
window.doLogout = async function() {
  if (unsubUser) unsubUser();
  await signOut(auth);
  window.location.href = "index.html";
};

// =============================================
// CATEGORIES
// =============================================
function renderCategories() {
  const grid = document.getElementById("categories-grid");
  grid.innerHTML = CATEGORIES.map((cat, i) => `
    <div class="cat-card ${cat.cls} ${i === selectedCat ? "active" : ""} fade-up"
         style="animation-delay:${i * 0.07}s"
         onclick="selectCat(${i})">
      <div class="cat-bg-glow"></div>
      <div class="cat-icon-wrap">${cat.icon}</div>
      <div class="cat-name">${cat.name}</div>
      <div class="cat-cost">1 token per spin</div>
      <span class="cat-tag">${cat.tag}</span>
    </div>
  `).join("");
}

window.selectCat = function(i) {
  selectedCat = i;
  selectedSec = 0;
  renderCategories();
  renderSections();
  drawWheel();
  updateCostDisplay();
};

// =============================================
// SECTIONS
// =============================================
function renderSections() {
  const cat  = CATEGORIES[selectedCat];
  const grid = document.getElementById("sections-grid");
  grid.innerHTML = cat.sections.map((sec, i) => `
    <div class="sec-card ${i === selectedSec ? "active" : ""} fade-up"
         style="animation-delay:${i * 0.07}s"
         onclick="selectSec(${i})">
      <div class="sec-name">${sec.name}</div>
      <div class="sec-prizes-preview">
        ${sec.prizes.slice(0,5).map(p => `<span>${p}</span>`).join("")}
        <span>…</span>
      </div>
    </div>
  `).join("");
}

window.selectSec = function(i) {
  selectedSec = i;
  renderSections();
  drawWheel();
};

function updateCostDisplay() {
  document.getElementById("spin-cost-display").innerHTML =
    `Cost: <strong>1 Token</strong> per spin &nbsp;·&nbsp; <span style="color:var(--gold)">$1 = 3 Tokens</span>`;
}

// =============================================
// WHEEL DRAWING
// =============================================
function drawWheel(highlightIdx = -1) {
  const canvas = document.getElementById("wheel-canvas");
  const ctx    = canvas.getContext("2d");
  const prizes = CATEGORIES[selectedCat].sections[selectedSec].prizes;
  const colors = WHEEL_COLORS[CATEGORIES[selectedCat].id];
  const N      = prizes.length;
  const arc    = (2 * Math.PI) / N;
  const cx     = canvas.width / 2;
  const cy     = canvas.height / 2;
  const r      = cx - 4;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  for (let i = 0; i < N; i++) {
    const start = spinAngle + i * arc - Math.PI / 2;
    const end   = start + arc;

    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, start, end);
    ctx.closePath();
    ctx.fillStyle = i === highlightIdx ? "#ffffff" : colors[i % colors.length];
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.3)";
    ctx.lineWidth   = 1.5;
    ctx.stroke();

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(start + arc / 2);
    ctx.textAlign   = "right";
    const fontSize  = prizes[i].length > 9 ? 10 : 12;
    ctx.font        = `600 ${fontSize}px Outfit, sans-serif`;
    ctx.fillStyle   = i === highlightIdx ? "#111" : "rgba(255,255,255,0.95)";
    ctx.shadowColor = "rgba(0,0,0,0.5)";
    ctx.shadowBlur  = 3;
    ctx.fillText(prizes[i], r - 10, 4);
    ctx.restore();
  }

  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, 2 * Math.PI);
  ctx.strokeStyle = "rgba(255,255,255,0.2)";
  ctx.lineWidth   = 4;
  ctx.stroke();
}

// =============================================
// SPIN ID GENERATOR
// Format: SW-CATEGORY-TIMESTAMP-RANDOM
// Example: SW-GOLD-M3X7A2-K9PQ1
// =============================================
function generateSpinId(catId) {
  const ts   = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).substring(2, 7).toUpperCase();
  return `SW-${catId.toUpperCase()}-${ts}-${rand}`;
}

// =============================================
// SPIN — Firestore atomic transaction
// Token deduction + result ID written together.
// Neither can happen without the other.
// This makes it impossible to spin without
// spending a token, or fake a result.
// =============================================
window.doSpin = async function() {
  if (spinning) return;

  const snap   = await getDoc(doc(db, "users", currentUser.uid));
  const tokens = snap.data().tokens ?? 0;

  if (tokens < 1) {
    setResult("No tokens!", "Buy tokens to spin — $1 gives you 3 tokens.", "lose");
    return;
  }

  const cat    = CATEGORIES[selectedCat];
  const prizes = cat.sections[selectedSec].prizes;
  const N      = prizes.length;

  // Determine prize before animation starts
  const targetIdx = Math.floor(Math.random() * N);
  const prize     = prizes[targetIdx];
  const spinId    = generateSpinId(cat.id);
  const now       = Date.now();

  // ── Atomic transaction: deduct token + record result ──
  try {
    await runTransaction(db, async (tx) => {
      const userRef  = doc(db, "users", currentUser.uid);
      const userSnap = await tx.get(userRef);
      if (!userSnap.exists()) throw new Error("User not found.");

      const liveTokens = userSnap.data().tokens ?? 0;
      if (liveTokens < 1) throw new Error("Not enough tokens.");

      // 1. Deduct 1 token from user
      tx.update(userRef, { tokens: increment(-1) });

      // 2. Write immutable spin record to top-level "spins" collection (admin sees this)
      tx.set(doc(db, "spins", spinId), {
        spinId,
        uid:          currentUser.uid,
        username:     userData.username,
        category:     cat.name,
        categoryId:   cat.id,
        section:      cat.sections[selectedSec].name,
        prize,
        status:       "pending",
        tokensBefore: liveTokens,
        tokensAfter:  liveTokens - 1,
        createdAt:    serverTimestamp(),
        clientTs:     now,
      });

      // 3. Also write to user's own spin history (player sees this)
      tx.set(doc(db, "users", currentUser.uid, "spinHistory", spinId), {
        spinId,
        category:  cat.name,
        section:   cat.sections[selectedSec].name,
        prize,
        status:    "pending",
        createdAt: serverTimestamp(),
      });
    });
  } catch (err) {
    setResult("Spin Failed", err.message || "Please try again.", "lose");
    return;
  }

  // ── Animate wheel ──────────────────────────
  spinning = true;
  document.getElementById("btn-spin").disabled = true;
  setResult("Spinning…", "", "");

  const arc           = (2 * Math.PI) / N;
  const extraSpins    = (5 + Math.floor(Math.random() * 5)) * 2 * Math.PI;
  const targetOffset  = -targetIdx * arc - arc / 2;
  const normalised    = ((targetOffset - spinAngle) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
  const totalRotation = extraSpins + normalised;
  const startAngle    = spinAngle;
  const duration      = 4500 + Math.random() * 1500;
  const startTime     = performance.now();

  function easeOut(t) { return 1 - Math.pow(1 - t, 4); }

  function frame(ts) {
    const progress = Math.min((ts - startTime) / duration, 1);
    spinAngle = startAngle + totalRotation * easeOut(progress);
    drawWheel();
    if (progress < 1) {
      requestAnimationFrame(frame);
    } else {
      spinAngle = (startAngle + totalRotation) % (2 * Math.PI);
      drawWheel(targetIdx);
      finishSpin(prize, cat, spinId);
    }
  }
  requestAnimationFrame(frame);
};

// =============================================
// FINISH SPIN
// =============================================
async function finishSpin(prize, cat, spinId) {
  spinning = false;
  document.getElementById("btn-spin").disabled = false;

  const isNothing = prize.toLowerCase() === "nothing";
  const wmMatch   = prize.match(/^(\d+)\s*WM$/i);
  const userRef   = doc(db, "users", currentUser.uid);
  const spinRef   = doc(db, "spins", spinId);
  const histRef   = doc(db, "users", currentUser.uid, "spinHistory", spinId);

  if (wmMatch) {
    const won = parseInt(wmMatch[1]);
    // Award WM automatically
    await updateDoc(userRef,  { balance: increment(won) });
    await updateDoc(spinRef,  { status: "claimed-wm", wmAwarded: won });
    await updateDoc(histRef,  { status: "claimed-wm", wmAwarded: won });
    setResult(`🎉 ${prize}!`, `+${won} WM added to your wallet.`, "win", spinId);

  } else if (isNothing) {
    await updateDoc(spinRef,  { status: "nothing" });
    await updateDoc(histRef,  { status: "nothing" });
    setResult("Nothing this time…", "Better luck next spin!", "lose", spinId);

  } else {
    // Physical prize — pending admin claim
    setResult(`🎉 ${prize}!`, "Show your Spin ID below to claim this prize.", "win", spinId);
  }
}

// =============================================
// RESULT DISPLAY with Spin ID badge
// =============================================
function setResult(prize, detail, state, spinId = null) {
  const box      = document.getElementById("result-box");
  const prizeEl  = document.getElementById("result-prize");
  const detailEl = document.getElementById("result-detail");
  const idEl     = document.getElementById("result-spin-id");

  box.className        = "result-box" + (state ? " " + state : "");
  prizeEl.textContent  = prize;
  detailEl.textContent = detail;

  if (spinId) {
    idEl.style.display = "";
    idEl.innerHTML = `
      <div class="spin-id-label">🔑 Spin ID (click to copy)</div>
      <div class="spin-id-value" onclick="copySpinId('${spinId}')" title="Click to copy">
        <span>${spinId}</span>
        <span class="copy-hint">📋</span>
      </div>
    `;
  } else {
    idEl.style.display = "none";
    idEl.innerHTML = "";
  }
}

window.copySpinId = function(id) {
  navigator.clipboard.writeText(id).then(() => {
    const el = document.querySelector(".spin-id-value");
    if (el) {
      const orig = el.innerHTML;
      el.innerHTML = `<span style="color:var(--green)">✓ Copied!</span>`;
      setTimeout(() => { el.innerHTML = orig; }, 1500);
    }
  });
};

// =============================================
// SPIN HISTORY MODAL
// =============================================
window.openTxModal = function() {
  document.getElementById("tx-modal").classList.add("open");
  loadSpinHistory();
};
window.closeTxModal = function() {
  document.getElementById("tx-modal").classList.remove("open");
};

async function loadSpinHistory() {
  const list = document.getElementById("tx-list");
  list.innerHTML = "<p class='tx-empty'>Loading…</p>";

  const q    = query(
    collection(db, "users", currentUser.uid, "spinHistory"),
    orderBy("createdAt", "desc"),
    limit(50)
  );
  const snap = await getDocs(q);
  if (snap.empty) { list.innerHTML = "<p class='tx-empty'>No spins yet.</p>"; return; }

  const statusColor = {
    "pending":    "#f4c430",
    "claimed-wm": "var(--green)",
    "claimed":    "var(--green)",
    "nothing":    "var(--muted)",
    "rejected":   "var(--red)"
  };
  const statusLabel = {
    "pending":    "⏳ Pending",
    "claimed-wm": "✅ Auto-Claimed",
    "claimed":    "✅ Claimed",
    "nothing":    "— No Prize",
    "rejected":   "❌ Rejected"
  };

  list.innerHTML = snap.docs.map(d => {
    const s  = d.data();
    const ts = s.createdAt?.toDate?.()?.toLocaleString("en-US", {
      month:"short", day:"numeric", hour:"2-digit", minute:"2-digit"
    }) || "—";
    const sc = statusColor[s.status] || "var(--muted)";
    const sl = statusLabel[s.status] || s.status;
    return `
      <div class="tx-item">
        <div class="tx-left">
          <div class="tx-label">${s.prize}</div>
          <div class="tx-meta">${s.category} — ${s.section} · ${ts}</div>
          <div class="tx-spinid" onclick="copySpinId('${s.spinId}')" title="Click to copy">
            🔑 ${s.spinId} <span style="opacity:0.5;font-size:10px">copy</span>
          </div>
        </div>
        <div style="color:${sc};font-size:12px;font-weight:600;text-align:right;white-space:nowrap">${sl}</div>
      </div>
    `;
  }).join("");
}

// =============================================
// BUY TOKENS — $1 = 3 tokens
// =============================================
window.openFundsModal = function() {
  document.getElementById("funds-modal").classList.add("open");
  document.getElementById("funds-error").textContent = "";
  document.getElementById("funds-amount").value = "";
  updateTokenPreview();
};
window.closeFundsModal = function() {
  document.getElementById("funds-modal").classList.remove("open");
};
window.setAmount = function(dollars) {
  document.getElementById("funds-amount").value = dollars;
  updateTokenPreview();
};

function updateTokenPreview() {
  const dollars = parseFloat(document.getElementById("funds-amount")?.value || 0);
  const tokens  = isNaN(dollars) ? 0 : Math.floor(dollars) * 3;
  const el      = document.getElementById("token-preview");
  if (el) el.textContent = dollars > 0 ? `→ ${tokens} tokens` : "";
}

window.addFunds = async function() {
  const dollars = parseFloat(document.getElementById("funds-amount").value);
  const errEl   = document.getElementById("funds-error");
  errEl.textContent = "";

  if (!dollars || dollars <= 0 || isNaN(dollars)) {
    errEl.textContent = "Enter a valid dollar amount."; return;
  }
  if (dollars > 10000) {
    errEl.textContent = "Maximum $10,000 per purchase."; return;
  }

  const tokens = Math.floor(dollars) * 3;

  await runTransaction(db, async (tx) => {
    const userRef = doc(db, "users", currentUser.uid);

    // Add tokens to user
    tx.update(userRef, { tokens: increment(tokens) });

    // Log purchase globally (admin can see all purchases)
    const purchaseRef = doc(collection(db, "purchases"));
    tx.set(purchaseRef, {
      uid:       currentUser.uid,
      username:  userData.username,
      dollars,
      tokens,
      createdAt: serverTimestamp(),
    });

    // Log in user's transaction history
    const txRef = doc(collection(db, "users", currentUser.uid, "transactions"));
    tx.set(txRef, {
      type:      "credit",
      label:     `Bought ${tokens} tokens`,
      detail:    `$${dollars.toFixed(2)} → ${tokens} tokens`,
      amount:    tokens,
      dollars,
      createdAt: serverTimestamp(),
    });
  });

  closeFundsModal();
};
