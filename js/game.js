import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  doc, getDoc, setDoc, updateDoc, increment, collection,
  getDocs, query, orderBy, limit,
  serverTimestamp, runTransaction, onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
 
// =============================================
// WHEEL DATA
// weight: 0 = impossible to land on
// =============================================
const SPINS = {
  normal: {
    name: "Normal Spin",
    cost: 1,
    pityAt: 100,
    colors: ["#3a3080","#2d2466","#453a99","#221a55","#3d3590","#28206e","#4a40a8","#1e1a50"],
    prizes: [
      { label: "60 UC / $0.99",    value: "60uc",          weight: 3 },
      { label: "60 UC / $0.99",    value: "60uc",          weight: 3 },
      { label: "Golden Ticket",    value: "golden_ticket", weight: 1  },
      { label: "Free Token",       value: "free_token",    weight: 3  },
      { label: "1800 UC / $19.99", value: "1800uc",        weight: 0  },
      { label: "Nothing",          value: "nothing",       weight: 45 },
      { label: "Nothing",          value: "nothing",       weight: 45 },
    ]
  },
  golden: {
    name: "Golden Spin",
    cost: 5,
    pityAt: 100,
    colors: ["#8b6914","#a07818","#c49020","#e0aa28","#b07010","#d09820","#f0b830","#986010"],
    prizes: [
      { label: "660 UC / $9.99",   value: "660uc",   weight: 0  },
      { label: "325 UC / $4.99",   value: "325uc",   weight: 1  },
      { label: "325 UC / $4.99",   value: "325uc",   weight: 0  },
      { label: "120 UC / $1.99",   value: "120uc",   weight: 5 },
      { label: "60 UC / $0.99",    value: "60uc",    weight: 24 },
      { label: "3850 UC / $49.99", value: "3850uc",  weight: 0  },
      { label: "60 UC / $0.99",    value: "60uc",    weight: 30 },
      { label: "Nothing",          value: "nothing", weight: 40  },
    ]
  }
};
 
// =============================================
// WEIGHTED RANDOM
// =============================================
function weightedRandom(prizes) {
  const total = prizes.reduce((sum, p) => sum + p.weight, 0);
  let rand = Math.random() * total;
  for (let i = 0; i < prizes.length; i++) {
    rand -= prizes[i].weight;
    if (rand <= 0) return i;
  }
  return prizes.length - 1;
}
 
// =============================================
// STATE
// =============================================
let currentUser = null;
let userData    = null;
let spinType    = "normal";
let spinning    = false;
let spinAngle   = 0;
let unsubUser   = null;
 
// =============================================
// AUTH GUARD
// =============================================
onAuthStateChanged(auth, async (user) => {
  if (!user) { window.location.href = "index.html"; return; }
  currentUser = user;
 
  const userRef = doc(db, "users", user.uid);
  let snap = await getDoc(userRef);
  if (!snap.exists()) {
    await setDoc(userRef, {
      username: user.email.split("@")[0],
      email: user.email,
      tokens: 0,
      normalSpins: 0,
      goldenSpins: 0,
      createdAt: serverTimestamp()
    });
    snap = await getDoc(userRef);
  }
  userData = snap.data();
  document.getElementById("nav-username").textContent = userData.username;
  subscribeUser();
  drawWheel();
  updateSpinUI();
});
 
function subscribeUser() {
  if (unsubUser) unsubUser();
  unsubUser = onSnapshot(doc(db, "users", currentUser.uid), (snap) => {
    if (!snap.exists()) return;
    userData = snap.data();
    document.getElementById("nav-tokens").textContent = userData.tokens || 0;
    document.getElementById("sib-tokens").textContent = userData.tokens || 0;
    updatePityDisplay();
  });
}
 
window.doLogout = async function() {
  if (unsubUser) unsubUser();
  await signOut(auth);
  window.location.href = "index.html";
};
 
// =============================================
// PITY DISPLAY
// =============================================
function updatePityDisplay() {
  if (!userData) return;
  const spin      = SPINS[spinType];
  const pityAt    = spin.pityAt;
  const spinsKey  = spinType === "golden" ? "goldenSpins" : "normalSpins";
  const current   = userData[spinsKey] || 0;
  const remaining = pityAt - (current % pityAt);
  const el        = document.getElementById("pity-display");
  if (el) {
    el.style.display = "";
    if (remaining === pityAt) {
      el.innerHTML = "Pity Counter: <strong style='color:var(--gold)'>0 / " + pityAt + "</strong> spins — guaranteed special prize at " + pityAt + "!";
    } else {
      el.innerHTML = "Pity Counter: <strong style='color:var(--gold)'>" + current % pityAt + " / " + pityAt + "</strong> spins — " + remaining + " left until guaranteed special prize!";
    }
  }
}
 
// =============================================
// SPIN TYPE
// =============================================
window.selectSpinType = function(type) {
  spinType = type;
  document.getElementById("card-normal").classList.toggle("active", type === "normal");
  document.getElementById("card-golden").classList.toggle("active", type === "golden");
  document.getElementById("wheel-canvas").classList.toggle("golden-glow", type === "golden");
  document.getElementById("btn-spin").classList.toggle("golden", type === "golden");
  drawWheel();
  updateSpinUI();
  updatePityDisplay();
};
 
function updateSpinUI() {
  const spin = SPINS[spinType];
  document.getElementById("sib-type").textContent = spin.name;
  document.getElementById("sib-cost").innerHTML = "Costs <strong>" + spin.cost + " Token" + (spin.cost > 1 ? "s" : "") + "</strong>";
  document.getElementById("sib-tokens").textContent = userData ? (userData.tokens || 0) : 0;
  updatePityDisplay();
}
 
// =============================================
// WHEEL DRAWING
// =============================================
function drawWheel(highlightIdx) {
  if (highlightIdx === undefined) highlightIdx = -1;
  const canvas = document.getElementById("wheel-canvas");
  const ctx    = canvas.getContext("2d");
  const spin   = SPINS[spinType];
  const prizes = spin.prizes;
  const colors = spin.colors;
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
    const lbl      = prizes[i].label;
    const fontSize = lbl.length > 12 ? 9 : lbl.length > 8 ? 10 : 12;
    ctx.font        = "600 " + fontSize + "px Outfit, sans-serif";
    ctx.fillStyle   = i === highlightIdx ? "#111" : "rgba(255,255,255,0.95)";
    ctx.shadowColor = "rgba(0,0,0,0.6)";
    ctx.shadowBlur  = 3;
    ctx.fillText(lbl, r - 10, 4);
    ctx.restore();
  }
 
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, 2 * Math.PI);
  ctx.strokeStyle = spinType === "golden" ? "rgba(244,196,48,0.5)" : "rgba(255,255,255,0.2)";
  ctx.lineWidth   = 4;
  ctx.stroke();
}
 
// =============================================
// SPIN ID GENERATOR
// =============================================
function generateSpinId(type) {
  const prefix = type === "golden" ? "SWG" : "SWN";
  const ts     = Date.now().toString(36).toUpperCase();
  const rand   = Math.random().toString(36).substring(2, 6).toUpperCase();
  return prefix + "-" + ts + "-" + rand;
}
 
// =============================================
// CHECK PITY
// Returns pity prize label if triggered, else null
// =============================================
async function checkPity(type, newSpinCount) {
  const pityAt = SPINS[type].pityAt;
  if (newSpinCount % pityAt !== 0) return null;
 
  // Fetch admin-set pity prize
  const pityRef  = doc(db, "config", type + "_pity");
  const pitySnap = await getDoc(pityRef);
  if (!pitySnap.exists()) return "Special Prize";
  return pitySnap.data().prize || "Special Prize";
}
 
// =============================================
// DO SPIN
// =============================================
window.doSpin = async function() {
  if (spinning) return;
 
  const snap   = await getDoc(doc(db, "users", currentUser.uid));
  const tokens = snap.data().tokens || 0;
  const spin   = SPINS[spinType];
 
  if (tokens < spin.cost) {
    setResult("No tokens!", "Redeem a ticket to get tokens.", "lose");
    return;
  }
 
  const spinsKey     = spinType === "golden" ? "goldenSpins" : "normalSpins";
  const currentCount = snap.data()[spinsKey] || 0;
  const newCount     = currentCount + 1;
  const isPity       = newCount % spin.pityAt === 0;
 
  // Check pity prize before transaction
  let pityPrize = null;
  if (isPity) {
    pityPrize = await checkPity(spinType, newCount);
  }
 
  const prizes    = spin.prizes;
  const targetIdx = isPity ? 0 : weightedRandom(prizes); // pity overrides wheel result
  const prize     = isPity ? { label: pityPrize, value: "pity_prize" } : prizes[targetIdx];
  const spinId    = generateSpinId(spinType);
 
  try {
    await runTransaction(db, async (tx) => {
      const userRef  = doc(db, "users", currentUser.uid);
      const userSnap = await tx.get(userRef);
      const live     = userSnap.data().tokens || 0;
      if (live < spin.cost) throw new Error("Not enough tokens.");
 
      const updates = { tokens: increment(-spin.cost) };
      updates[spinsKey] = increment(1);
      tx.update(userRef, updates);
 
      tx.set(doc(db, "spins", spinId), {
        spinId: spinId,
        uid: currentUser.uid,
        username: userData.username,
        spinType: spinType,
        prize: prize.label,
        prizeValue: prize.value,
        isPity: isPity,
        status: "pending",
        tokensBefore: live,
        tokensAfter: live - spin.cost,
        spinNumber: newCount,
        createdAt: serverTimestamp()
      });
 
      tx.set(doc(db, "users", currentUser.uid, "spinHistory", spinId), {
        spinId: spinId,
        spinType: spinType,
        prize: prize.label,
        prizeValue: prize.value,
        isPity: isPity,
        status: "pending",
        createdAt: serverTimestamp()
      });
    });
  } catch (err) {
    setResult("Error!", err.message, "lose");
    return;
  }
 
  spinning = true;
  document.getElementById("btn-spin").disabled = true;
  setResult("Spinning...", "", "");
 
  const N             = prizes.length;
  const arc           = (2 * Math.PI) / N;
  const extraSpins    = (5 + Math.floor(Math.random() * 5)) * 2 * Math.PI;
  const targetOffset  = -targetIdx * arc - arc / 2;
  const normalised    = ((targetOffset - spinAngle) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
  const totalRotation = extraSpins + normalised;
  const startAngle    = spinAngle;
  const duration      = 4500 + Math.random() * 1500;
  const startTime     = performance.now();
 
  function easeOut(t) { return 1 - Math.pow(1 - t, 4); }
 
  function frame(now) {
    const progress = Math.min((now - startTime) / duration, 1);
    spinAngle = startAngle + totalRotation * easeOut(progress);
    drawWheel();
    if (progress < 1) {
      requestAnimationFrame(frame);
    } else {
      spinAngle = (startAngle + totalRotation) % (2 * Math.PI);
      drawWheel(targetIdx);
      finishSpin(prize, spinId, isPity);
    }
  }
  requestAnimationFrame(frame);
};
 
// =============================================
// FINISH SPIN
// =============================================
async function finishSpin(prize, spinId, isPity) {
  spinning = false;
  document.getElementById("btn-spin").disabled = false;
 
  const spinRef = doc(db, "spins", spinId);
  const histRef = doc(db, "users", currentUser.uid, "spinHistory", spinId);
 
  if (isPity) {
    // Pity is a special admin-set prize, completely separate from the wheel
    setResult("PITY PRIZE!", prize.label + " — Show your Spin ID to claim your special prize!", "golden-win", spinId, true);
    return;
  }
 
  if (prize.value === "nothing") {
    await updateDoc(spinRef, { status: "nothing" });
    await updateDoc(histRef, { status: "nothing" });
    setResult("Nothing this time...", "Better luck next spin!", "lose", spinId);
 
  } else if (prize.value === "free_token") {
    await updateDoc(doc(db, "users", currentUser.uid), { tokens: increment(1) });
    await updateDoc(spinRef, { status: "claimed-token" });
    await updateDoc(histRef, { status: "claimed-token" });
    setResult("Free Token!", "1 token added to your account.", "win", spinId);
 
  } else if (prize.value === "golden_ticket") {
    await updateDoc(doc(db, "users", currentUser.uid), { tokens: increment(5) });
    await updateDoc(spinRef, { status: "golden-ticket" });
    await updateDoc(histRef, { status: "golden-ticket" });
    setResult("GOLDEN TICKET!", "You got 5 tokens for a Golden Spin!", "golden-win", spinId);
 
  } else if (prize.value === "1800uc") {
    setResult("1800 UC / $19.99!", "Show your Spin ID to claim your UC.", "golden-win", spinId);
 
  } else if (prize.value === "3850uc") {
    setResult("3850 UC / $49.99!", "Show your Spin ID to claim your UC.", "golden-win", spinId);
 
  } else {
    setResult("You won " + prize.label + "!", "Show your Spin ID to claim your PUBG UC.", "win", spinId);
  }
}
 
// =============================================
// RESULT DISPLAY
// =============================================
function setResult(prize, detail, state, spinId, isPity) {
  const box      = document.getElementById("result-box");
  const prizeEl  = document.getElementById("result-prize");
  const detailEl = document.getElementById("result-detail");
  const idEl     = document.getElementById("result-spin-id");
 
  box.className        = "result-box" + (state ? " " + state : "");
  prizeEl.textContent  = isPity ? "PITY PRIZE!" : prize;
  detailEl.textContent = isPity ? prize + " — Show your Spin ID to claim." : detail;
 
  if (spinId) {
    idEl.style.display = "";
    idEl.innerHTML = "<div class='spin-id-label'>Spin ID — click to copy</div><div class='spin-id-value' onclick=\"copyText('" + spinId + "')\" title='Click to copy'><span>" + spinId + "</span><span>Copy</span></div>";
  } else {
    idEl.style.display = "none";
    idEl.innerHTML = "";
  }
}
 
window.copyText = function(text) {
  navigator.clipboard.writeText(text).then(function() {
    const el = document.querySelector(".spin-id-value");
    if (el) {
      const orig = el.innerHTML;
      el.innerHTML = "<span style='color:var(--green)'>Copied!</span>";
      setTimeout(function() { el.innerHTML = orig; }, 1500);
    }
  });
};
 
// =============================================
// TICKET REDEEM MODAL
// =============================================
window.openTicketModal = function() {
  document.getElementById("ticket-modal").classList.add("open");
  document.getElementById("redeem-error").textContent   = "";
  document.getElementById("redeem-success").textContent = "";
  document.getElementById("redeem-code").value          = "";
};
 
window.closeTicketModal = function() {
  document.getElementById("ticket-modal").classList.remove("open");
};
 
window.redeemCode = async function() {
  const code  = document.getElementById("redeem-code").value.trim().toUpperCase();
  const errEl = document.getElementById("redeem-error");
  const sucEl = document.getElementById("redeem-success");
  errEl.textContent = "";
  sucEl.textContent = "";
  if (!code) { errEl.textContent = "Enter a ticket code."; return; }
  try {
    let tokensWon = 0;
    await runTransaction(db, async (tx) => {
      const ticketRef  = doc(db, "tickets", code);
      const ticketSnap = await tx.get(ticketRef);
      if (!ticketSnap.exists()) throw new Error("Invalid code — ticket not found.");
      const ticket = ticketSnap.data();
      if (ticket.used) throw new Error("This ticket has already been redeemed.");
      tokensWon = ticket.tokens || 0;
      tx.update(ticketRef, { used: true, usedBy: currentUser.uid, usedAt: serverTimestamp() });
      tx.update(doc(db, "users", currentUser.uid), { tokens: increment(tokensWon) });
    });
    sucEl.style.color  = "var(--green)";
    sucEl.textContent  = "You got " + tokensWon + " tokens!";
    document.getElementById("redeem-code").value = "";
  } catch (err) {
    errEl.textContent = err.message;
  }
};
 
// =============================================
// SPIN HISTORY MODAL
// =============================================
window.openHistoryModal = function() {
  document.getElementById("history-modal").classList.add("open");
  loadHistory();
};
 
window.closeHistoryModal = function() {
  document.getElementById("history-modal").classList.remove("open");
};
 
async function loadHistory() {
  const list = document.getElementById("history-list");
  list.innerHTML = "<p class='tx-empty'>Loading...</p>";
  const q    = query(collection(db, "users", currentUser.uid, "spinHistory"), orderBy("createdAt", "desc"), limit(50));
  const snap = await getDocs(q);
  if (snap.empty) { list.innerHTML = "<p class='tx-empty'>No spins yet.</p>"; return; }
 
  const statusColor = { "pending": "var(--gold)", "claimed": "var(--green)", "claimed-token": "var(--green)", "golden-ticket": "var(--gold)", "nothing": "var(--muted)", "rejected": "var(--red)" };
  const statusLabel = { "pending": "Pending", "claimed": "Claimed", "claimed-token": "Token Given", "golden-ticket": "Golden Ticket", "nothing": "No Prize", "rejected": "Rejected" };
 
  list.innerHTML = snap.docs.map(function(d) {
    const s      = d.data();
    const ts     = s.createdAt && s.createdAt.toDate ? s.createdAt.toDate().toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
    const typeTag = s.spinType === "golden" ? "Golden" : "Normal";
    const pityTag = s.isPity ? " PITY" : "";
    return "<div class='tx-item'><div class='tx-left'><div class='tx-label'>" + s.prize + " (" + typeTag + pityTag + ")</div><div class='tx-meta'>" + ts + "</div><div class='tx-spinid' onclick=\"copyText('" + s.spinId + "')\" title='Click to copy'>" + s.spinId + " (copy)</div></div><div style='color:" + (statusColor[s.status] || "var(--muted)") + ";font-size:12px;font-weight:600;white-space:nowrap;text-align:right'>" + (statusLabel[s.status] || s.status) + "</div></div>";
  }).join("");
}