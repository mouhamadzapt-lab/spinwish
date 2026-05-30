import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyB_-YHLuZpD2T3OBnFdHes6PA8_WZ65Djk",
  authDomain: "spin-34518.firebaseapp.com",
  projectId: "spin-34518",
  storageBucket: "spin-34518.firebasestorage.app",
  messagingSenderId: "28094778307",
  appId: "1:28094778307:web:507bc389a4019afd478b76",
  measurementId: "G-Q6088XFP0L"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
