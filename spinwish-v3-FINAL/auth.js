import { auth, db } from "./firebase-config.js";
import {
  createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  doc, setDoc, getDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Only redirect if we're sure the user doc exists
onAuthStateChanged(auth, async (user) => {
  if (!user) return; // not logged in, stay on login page
  try {
    const snap = await getDoc(doc(db, "users", user.uid));
    if (snap.exists()) {
      window.location.href = "game.html";
    }
    // if doc doesn't exist, stay on login page (let them register properly)
  } catch (e) {
    console.error("Auth check failed:", e);
    // don't redirect on error — stay on login page
  }
});

window.switchTab = function(tab) {
  const isLogin = tab === "login";
  document.getElementById("login-form").style.display    = isLogin ? "" : "none";
  document.getElementById("register-form").style.display = isLogin ? "none" : "";
  document.getElementById("tab-login").classList.toggle("active", isLogin);
  document.getElementById("tab-register").classList.toggle("active", !isLogin);
};

window.doRegister = async function() {
  const username = document.getElementById("reg-username").value.trim();
  const email    = document.getElementById("reg-email").value.trim();
  const password = document.getElementById("reg-pass").value;
  const errEl    = document.getElementById("register-error");
  errEl.textContent = "";
  if (!username || !email || !password) { errEl.textContent = "Please fill in all fields."; return; }
  if (password.length < 6) { errEl.textContent = "Password must be at least 6 characters."; return; }
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await setDoc(doc(db, "users", cred.user.uid), {
      username, email, tokens: 0, createdAt: serverTimestamp()
    });
    window.location.href = "game.html";
  } catch (e) { errEl.textContent = friendlyError(e.code); }
};

window.doLogin = async function() {
  const email    = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-pass").value;
  const errEl    = document.getElementById("login-error");
  errEl.textContent = "";
  if (!email || !password) { errEl.textContent = "Please fill in all fields."; return; }
  try {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    // Make sure user doc exists, create it if missing
    const userRef  = doc(db, "users", cred.user.uid);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) {
      await setDoc(userRef, {
        username: email.split("@")[0],
        email, tokens: 0, createdAt: serverTimestamp()
      });
    }
    window.location.href = "game.html";
  } catch (e) { errEl.textContent = friendlyError(e.code); }
};

window.redeemTicket = async function() {
  const msg = document.getElementById("ticket-msg");
  msg.style.color = "var(--muted)";
  msg.textContent = "Sign in first, then redeem from the game page.";
};

function friendlyError(code) {
  const map = {
    "auth/email-already-in-use": "That email is already registered.",
    "auth/invalid-email":        "Please enter a valid email.",
    "auth/weak-password":        "Password is too weak (min 6 chars).",
    "auth/user-not-found":       "No account found with that email.",
    "auth/wrong-password":       "Incorrect password.",
    "auth/invalid-credential":   "Invalid email or password.",
    "auth/too-many-requests":    "Too many attempts. Please wait.",
  };
  return map[code] || "Something went wrong. Please try again.";
}
