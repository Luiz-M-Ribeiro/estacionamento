// script.js (module) - DOM + contadores + Firestore real-time
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import {
  getFirestore, doc, getDoc, setDoc, onSnapshot, collection, query, where, getDocs, writeBatch
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

// ======== COLE SUA CONFIG AQUI (substitua os placeholders) ========

 const firebaseConfig = {
    apiKey: "AIzaSyDLGSuIt8I0OsHN5juy4GIFQBSR1Mhd-ns",
    authDomain: "estacionamento-3634a.firebaseapp.com",
    projectId: "estacionamento-3634a",
    storageBucket: "estacionamento-3634a.firebasestorage.app",
    messagingSenderId: "1072827896239",
    appId: "1:1072827896239:web:581e0ca9064afe1b41df5a"
  };

// =================================================================

let firestore = null;
try {
  const app = initializeApp(firebaseConfig);
  firestore = getFirestore(app);
} catch (err) {
  console.warn("Firebase não inicializado. Verifique suas credenciais.", err);
}

// fallback local default (case Firestore não esteja configurado)
const DEFAULT_COUNT = 24;
const defaultSpots = Array.from({ length: DEFAULT_COUNT }, (_, i) => ({
  id: i + 1,
  status: "free",
  note: ""
}));

const SESSION_KEY = "est_session";

// util
function getSession() {
  const s = localStorage.getItem(SESSION_KEY);
  return s ? JSON.parse(s) : null;
}
function requireAuthOrRedirect() {
  const session = getSession();
  if (!session) {
    window.location.href = "./index.html";
    return null;
  }
  return session;
}

// UI references
const parkingEl = document.getElementById("parkingMap");
const countFreeEl = document.getElementById("countFree");
const countOccupiedEl = document.getElementById("countOccupied");
const countReservedEl = document.getElementById("countReserved");
const btnReset = document.getElementById("btnReset");
const btnFillRandom = document.getElementById("btnFillRandom");
const btnSyncLocal = document.getElementById("btnSyncLocal");

// render user area (top)
function renderUserArea() {
  const userArea = document.getElementById("userArea");
  const session = getSession();
  if (!session) {
    userArea.innerHTML = `<a class="btn ghost" href="login.html">Entrar</a>`;
    return;
  }
  userArea.innerHTML = `
    <span style="margin-right:12px">Olá, ${session.name}</span>
    <button id="btnLogout" class="btn ghost">Sair</button>
  `;
  document.getElementById("btnLogout").addEventListener("click", () => {
    localStorage.removeItem(SESSION_KEY);
    window.location.href = "./index.html";
  });
}

// ---------- Firestore helpers ----------
const COLLECTION = "parking_spots"; // colecao com documentos para cada vaga

async function ensureSpotsInFirestore() {
  if (!firestore) return;
  // check if collection exists (quick check: getDocs)
  const snapshot = await getDocs(query(collection(firestore, COLLECTION)));
  if (!snapshot.empty) return; // já tem dados
  // inicializa coleção com documentos
  const batch = writeBatch(firestore);
  defaultSpots.forEach(s => {
    const d = doc(firestore, COLLECTION, String(s.id));
    batch.set(d, s);
  });
  await batch.commit();
}

// toggle a vaga no firestore (safe concurrent)
async function updateSpotInFirestore(id, partial) {
  if (!firestore) {
    // fallback local
    const local = loadLocalSpots();
    const idx = local.findIndex(x => x.id === id);
    if (idx === -1) return;
    local[idx] = { ...local[idx], ...partial };
    saveLocalSpots(local);
    renderSpots(local);
    return;
  }
  const dref = doc(firestore, COLLECTION, String(id));
  // setDoc replaces doc — use setDoc to replace, because small demo
  const current = await getDoc(dref);
  const curData = current.exists() ? current.data() : { id, status: "free", note: "" };
  await setDoc(dref, { ...curData, ...partial });
}

// listen em tempo real na coleção
function listenSpotsRealtime(onChange) {
  if (!firestore) {
    // fallback: load local and call onChange
    const local = loadLocalSpots();
    onChange(local);
    return () => {}; // nada pra cancelar
  }
  const colRef = collection(firestore, COLLECTION);
  const unsub = onSnapshot(colRef, snapshot => {
    const spots = [];
    snapshot.forEach(docSnap => {
      const data = docSnap.data();
      // garantia de inteiro
      data.id = Number(data.id);
      spots.push(data);
    });
    // ordenar por id
    spots.sort((a, b) => a.id - b.id);
    onChange(spots);
  }, err => {
    console.error("Erro no listener Firestore:", err);
  });
  return unsub;
}

// ---------- LocalStorage fallback ----------
const LS_SPOTS_KEY = "est_spots_v1";

function loadLocalSpots() {
  const raw = localStorage.getItem(LS_SPOTS_KEY);
  if (!raw) {
    localStorage.setItem(LS_SPOTS_KEY, JSON.stringify(defaultSpots));
    return JSON.parse(JSON.stringify(defaultSpots));
  }
  try {
    return JSON.parse(raw);
  } catch {
    localStorage.setItem(LS_SPOTS_KEY, JSON.stringify(defaultSpots));
    return JSON.parse(JSON.stringify(defaultSpots));
  }
}
function saveLocalSpots(spots) {
  localStorage.setItem(LS_SPOTS_KEY, JSON.stringify(spots));
}

// ---------- Renderers ----------
function renderSpots(spots) {
  parkingEl.innerHTML = "";
  let cFree = 0, cOcc = 0, cRes = 0;

  spots.forEach(spot => {
    const el = document.createElement("div");
    el.className = `spot ${spot.status}`;
    el.setAttribute("data-id", spot.id);
    el.setAttribute("role", "button");
    el.setAttribute("tabindex", "0");

    el.innerHTML = `
      <div class="id">Vaga ${spot.id}</div>
      <div class="status">${statusLabel(spot.status)}</div>
      <div class="meta">${spot.note || "&nbsp;"}</div>
    `;

    el.addEventListener("click", async () => {
      // alterna status: free -> occupied -> reserved -> free
      const next = nextStatus(spot.status);
      await updateSpotInFirestore(spot.id, { status: next });
      // Firestore listener atualizará o DOM
    });

    el.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        el.click();
      }
    });

    el.addEventListener("contextmenu", async (ev) => {
      ev.preventDefault();
      const newNote = prompt("Nota da vaga (placa/responsável). Deixe em branco para limpar:", spot.note || "");
      if (newNote !== null) {
        await updateSpotInFirestore(spot.id, { note: newNote.trim() });
      }
    });

    parkingEl.appendChild(el);

    if (spot.status === "free") cFree++;
    else if (spot.status === "occupied") cOcc++;
    else if (spot.status === "reserved") cRes++;
  });

  countFreeEl.textContent = `Livre: ${cFree}`;
  countOccupiedEl.textContent = `Ocupada: ${cOcc}`;
  countReservedEl.textContent = `Reservada: ${cRes}`;
}

function statusLabel(status) {
  if (status === "free") return "Livre";
  if (status === "occupied") return "Ocupada";
  if (status === "reserved") return "Reservada";
  return status;
}
function nextStatus(cur) {
  const order = ["free", "occupied", "reserved"];
  return order[(order.indexOf(cur) + 1) % order.length];
}

// ---------- Inicialização e eventos ----------
document.addEventListener("DOMContentLoaded", async () => {
  const session = requireAuthOrRedirect();
  if (!session) return;

  renderUserArea();

  // garante que Firestore tenha dados iniciais (apenas se inicializado)
  if (firestore) {
    try {
      await ensureSpotsInFirestore();
    } catch (err) {
      console.warn("Falha ao inicializar dados no Firestore:", err);
    }
  }

  // listener em tempo real
  const unsub = listenSpotsRealtime(spots => {
    renderSpots(spots);
  });

  btnReset.addEventListener("click", async () => {
    if (!confirm("Restaurar estado padrão das vagas?")) return;
    if (firestore) {
      // sobrescreve todos os docs
      const batch = [];
      for (const s of defaultSpots) {
        // set each doc
        await updateSpotInFirestore(s.id, { status: s.status, note: "" });
      }
    } else {
      localStorage.removeItem(LS_SPOTS_KEY);
      renderSpots(loadLocalSpots());
    }
  });

  btnFillRandom.addEventListener("click", async () => {
    const spots = firestore ? (await getDocs(collection(firestore, COLLECTION))).docs.map(d => d.data()) : loadLocalSpots();
    // gerar aleatório
    spots.forEach(s => {
      const r = Math.random();
      if (r < 0.6) s.status = "free";
      else if (r < 0.85) s.status = "occupied";
      else s.status = "reserved";
      s.note = "";
    });
    // salvar
    if (firestore) {
      for (const s of spots) {
        await updateSpotInFirestore(s.id, { status: s.status, note: s.note });
      }
    } else {
      saveLocalSpots(spots);
      renderSpots(spots);
    }
  });

  btnSyncLocal.addEventListener("click", async () => {
    // força resync local -> firestore (cuidado)
    if (!confirm("Forçar upload dos dados locais para Firestore (sobrescreverá dados remotos)?")) return;
    const local = loadLocalSpots();
    if (firestore) {
      for (const s of local) {
        await updateSpotInFirestore(s.id, { status: s.status, note: s.note });
      }
    } else {
      alert("Firestore não configurado.");
    }
  });

  // cleanup on unload
  window.addEventListener("beforeunload", () => {
    if (typeof unsub === "function") unsub();
  });
});
