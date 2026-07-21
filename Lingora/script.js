import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
    getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword,
    onAuthStateChanged, signOut, updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
    getDatabase, ref, set, get, child, push, onValue, remove
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const firebaseConfig = {
    apiKey: "AIzaSyCc0B_xCY3cwilBbRZ3g6Kz65XEMmvo8Rk",
    authDomain: "respict-212a7.firebaseapp.com",
    databaseURL: "https://respict-212a7-default-rtdb.firebaseio.com",
    projectId: "respict-212a7",
    storageBucket: "respict-212a7.firebasestorage.app",
    messagingSenderId: "531604352837",
    appId: "1:531604352837:web:3a1bc13f75c9dbd329d82c",
    measurementId: "G-M5G726058Q"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

/* ---------------- language table ---------------- */
const LANGS = {
    ar: { name: "العربية", speech: "ar-SA" },
    en: { name: "English", speech: "en-US" },
    fr: { name: "Français", speech: "fr-FR" },
    es: { name: "Español", speech: "es-ES" },
    tr: { name: "Türkçe", speech: "tr-TR" },
    de: { name: "Deutsch", speech: "de-DE" },
    ru: { name: "Русский", speech: "ru-RU" },
    zh: { name: "中文", speech: "zh-CN" },
};

let currentUser = null;
let currentProfile = null;
let activeFriendUid = null;
let activeFriendProfile = null;
let friendsCache = {};

/* ============================================================
   THE GREETING CONSTELLATION — decorative hero background
   ============================================================ */
const GREETINGS = [
    "مرحبا", "Hello", "Bonjour", "Hola", "Merhaba", "Hallo", "Привет", "你好",
    "こんにちは", "안녕하세요", "Ciao", "Olá", "नमस्ते", "سلام", "Cześć", "Xin chào"
];
function buildConstellation() {
    const host = document.getElementById("constellation");
    if (!host) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const count = window.innerWidth < 640 ? 8 : 14;
    const shuffled = [...GREETINGS].sort(() => Math.random() - .5).slice(0, count);

    shuffled.forEach((word, i) => {
        const el = document.createElement("div");
        el.className = "greet" + (i % 2 === 0 ? " gold" : " violet");
        el.textContent = word;
        const top = 6 + Math.random() * 82;
        const left = 4 + Math.random() * 88;
        // keep a clear zone around the centered card
        const nearCenter = Math.abs(left - 50) < 24 && Math.abs(top - 50) < 30;
        el.style.top = (nearCenter ? (top < 50 ? top - 18 : top + 18) : top) + "%";
        el.style.left = left + "%";
        el.style.setProperty("--dx", (Math.random() * 30 - 15) + "px");
        el.style.setProperty("--dy", (Math.random() * 30 - 15) + "px");
        el.style.setProperty("--dr", (Math.random() * 6 - 3) + "deg");
        el.style.setProperty("--dur", (8 + Math.random() * 8) + "s");
        el.style.setProperty("--del", (Math.random() * 4) + "s");
        el.style.setProperty("--op", (0.45 + Math.random() * 0.35).toFixed(2));
        host.appendChild(el);
    });

    if (!reduced && window.matchMedia("(hover:hover)").matches) {
        let raf = null;
        document.getElementById("authScreen").addEventListener("mousemove", (e) => {
            if (raf) return;
            raf = requestAnimationFrame(() => {
                const w = window.innerWidth, h = window.innerHeight;
                const dx = (e.clientX / w - .5) * 16;
                const dy = (e.clientY / h - .5) * 16;
                host.style.transform = `translate(${dx}px, ${dy}px)`;
                raf = null;
            });
        });
    }
}
buildConstellation();

/* ---------------- helpers ---------------- */
function initials(name) { return (name || "?").trim().slice(0, 1).toUpperCase(); }
function chatIdFor(a, b) { return [a, b].sort().join("_"); }
function esc(s) { const d = document.createElement("div"); d.textContent = s || ""; return d.innerHTML; }

async function translateText(text, fromCode, toCode) {
    if (!text.trim()) return "";
    if (fromCode === toCode) return text;
    try {
        const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${fromCode}|${toCode}`;
        const res = await fetch(url);
        const data = await res.json();
        if (data && data.responseData && data.responseData.translatedText) {
            return data.responseData.translatedText;
        }
        return text;
    } catch (e) {
        console.error("translate error", e);
        return text;
    }
}

/* ---------------- auth tabs ---------------- */
const tabLogin = document.getElementById("tabLogin");
const tabSignup = document.getElementById("tabSignup");
const loginForm = document.getElementById("loginForm");
const signupForm = document.getElementById("signupForm");
const authError = document.getElementById("authError");
const authMsg = document.getElementById("authMsg");

tabLogin.onclick = () => {
    tabLogin.classList.add("active"); tabSignup.classList.remove("active");
    loginForm.style.display = "block"; signupForm.style.display = "none";
    authError.textContent = ""; authMsg.textContent = "";
};
tabSignup.onclick = () => {
    tabSignup.classList.add("active"); tabLogin.classList.remove("active");
    signupForm.style.display = "block"; loginForm.style.display = "none";
    authError.textContent = ""; authMsg.textContent = "";
};

function friendlyAuthError(err) {
    const code = err.code || "";
    if (code.includes("email-already-in-use")) return "هذا البريد الإلكتروني مستخدم بالفعل.";
    if (code.includes("invalid-email")) return "صيغة البريد الإلكتروني غير صحيحة.";
    if (code.includes("weak-password")) return "كلمة المرور ضعيفة، استخدم 6 أحرف على الأقل.";
    if (code.includes("user-not-found") || code.includes("wrong-password") || code.includes("invalid-credential")) return "البريد الإلكتروني أو كلمة المرور غير صحيحة.";
    return "حدث خطأ، حاول مرة أخرى: " + (err.message || "");
}

document.getElementById("signupBtn").onclick = async () => {
    authError.textContent = ""; authMsg.textContent = "";
    const name = document.getElementById("suName").value.trim();
    const lang = document.getElementById("suLang").value;
    const email = document.getElementById("suEmail").value.trim();
    const pass = document.getElementById("suPass").value;
    if (!name || !email || !pass) { authError.textContent = "الرجاء تعبئة كل الحقول."; return; }
    const btn = document.getElementById("signupBtn");
    btn.disabled = true;
    try {
        const cred = await createUserWithEmailAndPassword(auth, email, pass);
        await updateProfile(cred.user, { displayName: name });
        await set(ref(db, "users/" + cred.user.uid), {
            id: cred.user.uid,
            name, language: lang, email,
            nameLower: name.toLowerCase(),
            createdAt: Date.now()
        });
        authMsg.textContent = "تم إنشاء الحساب بنجاح!";
    } catch (err) {
        authError.textContent = friendlyAuthError(err);
    } finally {
        btn.disabled = false;
    }
};

document.getElementById("loginBtn").onclick = async () => {
    authError.textContent = ""; authMsg.textContent = "";
    const email = document.getElementById("loginEmail").value.trim();
    const pass = document.getElementById("loginPass").value;
    if (!email || !pass) { authError.textContent = "الرجاء تعبئة كل الحقول."; return; }
    const btn = document.getElementById("loginBtn");
    btn.disabled = true;
    try {
        await signInWithEmailAndPassword(auth, email, pass);
    } catch (err) {
        authError.textContent = friendlyAuthError(err);
    } finally {
        btn.disabled = false;
    }
};

document.getElementById("logoutBtn").onclick = () => signOut(auth);

/* ---------------- auth state ---------------- */
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        const snap = await get(child(ref(db), "users/" + user.uid));
        currentProfile = snap.exists() ? snap.val() : { name: user.displayName || "مستخدم", language: "ar" };
        document.getElementById("authScreen").style.display = "none";
        document.getElementById("appScreen").style.display = "block";
        document.getElementById("whoami").style.display = "flex";
        document.getElementById("whoamiName").textContent = currentProfile.name;
        listenFriends();
        listenRequests();
    } else {
        currentUser = null; currentProfile = null; activeFriendUid = null;
        document.getElementById("authScreen").style.display = "flex";
        document.getElementById("appScreen").style.display = "none";
        document.getElementById("whoami").style.display = "none";
    }
});

/* ---------------- search users ---------------- */
let searchTimer = null;
document.getElementById("searchInput").addEventListener("input", (e) => {
    clearTimeout(searchTimer);
    const term = e.target.value.trim().toLowerCase();
    searchTimer = setTimeout(() => runSearch(term), 300);
});

async function runSearch(term) {
    const box = document.getElementById("searchResults");
    box.innerHTML = "";
    if (!term) { return; }
    const snap = await get(ref(db, "users"));
    if (!snap.exists()) return;
    const all = snap.val();
    const results = Object.values(all).filter(u =>
        u.id !== currentUser.uid &&
        (u.name || "").toLowerCase().includes(term)
    ).slice(0, 15);

    if (results.length === 0) {
        box.innerHTML = `<div class="empty-note">لا يوجد نتائج مطابقة.</div>`;
        return;
    }

    for (const u of results) {
        const row = document.createElement("div");
        row.className = "userRow";
        const isFriend = !!friendsCache[u.id];
        row.innerHTML = `
      <div class="avatar">${esc(initials(u.name))}</div>
      <div class="userMeta">
        <div class="n">${esc(u.name)}</div>
        <div class="l">${esc((LANGS[u.language] || {}).name || u.language)}</div>
      </div>
      ${isFriend ? `<span class="l">صديق ✓</span>` : `<button class="smallbtn" data-uid="${u.id}">إضافة</button>`}
    `;
        box.appendChild(row);
    }
    box.querySelectorAll("button[data-uid]").forEach(btn => {
        btn.onclick = () => sendFriendRequest(btn.getAttribute("data-uid"));
    });
}

async function sendFriendRequest(toUid) {
    if (toUid === currentUser.uid) return;
    await set(ref(db, `friendRequests/${toUid}/${currentUser.uid}`), {
        fromUid: currentUser.uid,
        fromName: currentProfile.name,
        fromLang: currentProfile.language,
        status: "pending",
        timestamp: Date.now()
    });
    document.getElementById("searchInput").value = "";
    document.getElementById("searchResults").innerHTML = `<div class="empty-note">تم إرسال طلب الصداقة ✓</div>`;
}

/* ---------------- friend requests (incoming) ---------------- */
function listenRequests() {
    const reqRef = ref(db, `friendRequests/${currentUser.uid}`);
    onValue(reqRef, (snap) => {
        const list = document.getElementById("requestsList");
        const badge = document.getElementById("reqBadge");
        list.innerHTML = "";
        if (!snap.exists()) { badge.style.display = "none"; return; }
        const data = snap.val();
        const entries = Object.entries(data);
        badge.style.display = "inline-block";
        badge.textContent = entries.length;
        entries.forEach(([fromUid, req]) => {
            const row = document.createElement("div");
            row.className = "reqRow";
            row.innerHTML = `
        <div class="avatar">${esc(initials(req.fromName))}</div>
        <div class="userMeta">
          <div class="n">${esc(req.fromName)}</div>
          <div class="l">${esc((LANGS[req.fromLang] || {}).name || req.fromLang)}</div>
        </div>
        <button class="smallbtn accept">قبول</button>
        <button class="smallbtn reject">رفض</button>
      `;
            row.querySelector(".accept").onclick = () => acceptRequest(fromUid);
            row.querySelector(".reject").onclick = () => rejectRequest(fromUid);
            list.appendChild(row);
        });
    });
}

async function acceptRequest(fromUid) {
    await set(ref(db, `friends/${currentUser.uid}/${fromUid}`), true);
    await set(ref(db, `friends/${fromUid}/${currentUser.uid}`), true);
    await remove(ref(db, `friendRequests/${currentUser.uid}/${fromUid}`));
}
async function rejectRequest(fromUid) {
    await remove(ref(db, `friendRequests/${currentUser.uid}/${fromUid}`));
}

/* ---------------- friends list ---------------- */
function listenFriends() {
    const fRef = ref(db, `friends/${currentUser.uid}`);
    onValue(fRef, async (snap) => {
        const list = document.getElementById("friendsList");
        list.innerHTML = "";
        if (!snap.exists()) {
            friendsCache = {};
            list.innerHTML = `<div class="empty-note">لا يوجد أصدقاء بعد. ابحث عن أشخاص لبدء التواصل!</div>`;
            return;
        }
        const uids = Object.keys(snap.val());
        friendsCache = snap.val();
        for (const uid of uids) {
            const uSnap = await get(ref(db, "users/" + uid));
            if (!uSnap.exists()) continue;
            const u = uSnap.val();
            const row = document.createElement("div");
            row.className = "friendRow";
            row.dataset.uid = uid;
            row.innerHTML = `
        <div class="avatar">${esc(initials(u.name))}</div>
        <div class="userMeta">
          <div class="n">${esc(u.name)}</div>
          <div class="l">${esc((LANGS[u.language] || {}).name || u.language)}</div>
        </div>
      `;
            row.onclick = () => openChat(uid, u);
            list.appendChild(row);
        }
    });
}

/* ---------------- chat ---------------- */
const BRIDGE_ICON = `<svg viewBox="0 0 24 16" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M1 13c3-7 8-7 11 0" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  <circle cx="1.5" cy="13.5" r="1.5" fill="currentColor"/>
  <circle cx="12" cy="13" r="1.5" fill="currentColor"/>
</svg>`;

function openChat(uid, profile) {
    activeFriendUid = uid;
    activeFriendProfile = profile;
    document.querySelectorAll(".friendRow").forEach(r => r.classList.toggle("active", r.dataset.uid === uid));
    document.getElementById("chatPlaceholder").style.display = "none";
    document.getElementById("chatActive").style.display = "flex";
    document.getElementById("chatAvatar").textContent = initials(profile.name);
    document.getElementById("chatName").textContent = profile.name;
    document.getElementById("chatLang").textContent = (LANGS[profile.language] || {}).name || profile.language;

    if (window.innerWidth <= 860) {
        document.getElementById("sidebar").classList.remove("show");
        document.getElementById("chatpane").classList.add("show");
    }

    const cid = chatIdFor(currentUser.uid, uid);
    const msgsRef = ref(db, `chats/${cid}/messages`);
    onValue(msgsRef, (snap) => {
        const box = document.getElementById("messages");
        box.innerHTML = "";
        if (snap.exists()) {
            const data = snap.val();
            Object.values(data).sort((a, b) => a.timestamp - b.timestamp).forEach(renderMessage);
        }
        box.scrollTop = box.scrollHeight;
    });
}

document.getElementById("backBtn").onclick = () => {
    document.getElementById("sidebar").classList.add("show");
    document.getElementById("chatpane").classList.remove("show");
};

function renderMessage(m) {
    const mine = m.senderId === currentUser.uid;
    const box = document.getElementById("messages");
    const row = document.createElement("div");
    row.className = "msgRow" + (mine ? " mine" : "");
    const displayText = mine ? m.text : (m.translatedText || m.text);
    const time = new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const showToggle = !mine && m.translatedText && m.translatedText !== m.text;

    row.innerHTML = `
    <div class="bubbleWrap">
      <div class="bubble">${esc(displayText)}</div>
      ${showToggle ? `
        <button class="origToggle">${BRIDGE_ICON}<span>النص الأصلي</span></button>
        <div class="origReveal">${esc(m.text)}</div>
      ` : ""}
      <div class="timeStamp">${time}</div>
    </div>
  `;
    if (showToggle) {
        const toggleBtn = row.querySelector(".origToggle");
        const reveal = row.querySelector(".origReveal");
        toggleBtn.onclick = () => reveal.classList.toggle("open");
    }
    box.appendChild(row);
}

async function sendMessage() {
    const input = document.getElementById("msgInput");
    const text = input.value.trim();
    if (!text || !activeFriendUid) return;
    input.value = "";
    autoGrow(input);

    const myLang = currentProfile.language;
    const theirLang = activeFriendProfile.language;
    const translated = await translateText(text, myLang, theirLang);

    const cid = chatIdFor(currentUser.uid, activeFriendUid);
    const msgRef = push(ref(db, `chats/${cid}/messages`));
    await set(msgRef, {
        senderId: currentUser.uid,
        text,
        lang: myLang,
        translatedText: translated,
        translatedLang: theirLang,
        timestamp: Date.now()
    });
}
document.getElementById("sendBtn").onclick = sendMessage;

const msgInput = document.getElementById("msgInput");
msgInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
});
function autoGrow(el) { el.style.height = "auto"; el.style.height = Math.min(el.scrollHeight, 120) + "px"; }
msgInput.addEventListener("input", () => autoGrow(msgInput));

/* ---------------- speech to text ---------------- */
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognizer = null;
let isRecording = false;
const micBtn = document.getElementById("micBtn");

if (SpeechRecognition) {
    recognizer = new SpeechRecognition();
    recognizer.continuous = false;
    recognizer.interimResults = false;

    recognizer.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        msgInput.value = (msgInput.value ? msgInput.value + " " : "") + transcript;
        autoGrow(msgInput);
    };
    recognizer.onend = () => { isRecording = false; micBtn.classList.remove("recording"); };
    recognizer.onerror = () => { isRecording = false; micBtn.classList.remove("recording"); };

    micBtn.onclick = () => {
        if (!currentProfile) return;
        if (isRecording) { recognizer.stop(); return; }
        recognizer.lang = (LANGS[currentProfile.language] || LANGS.ar).speech;
        recognizer.start();
        isRecording = true;
        micBtn.classList.add("recording");
    };
} else {
    micBtn.style.display = "none";
}