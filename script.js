// === Configuration ===
// IMPORTANT: Do NOT put your API key in this file if you deploy publicly.
// Instead, deploy the included Cloudflare Worker (worker.js) and set PROXY_BASE
// to your worker URL. Example: "https://your-worker.example.workers.dev"
const PROXY_BASE = ""; // e.g., "https://your-worker.example.workers.dev"
const BASE_URL = "https://api.policeroleplay.community/v1/server";

// If you insist on testing locally WITHOUT a proxy (unsafe), set API_KEY here temporarily
// and run the page from a local file server. Never commit or publish your key.
const UNSAFE_API_KEY = ""; // <-- leave empty unless testing locally

const REFRESH_INTERVAL = 60 * 1000; // ms
const TIME_ZONE = "America/Los_Angeles";

// === Helpers ===
const $ = (id) => document.getElementById(id);
const fmtTime = (unix) => {
  if (!unix) return "Unknown time";
  return new Intl.DateTimeFormat([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: TIME_ZONE,
    hour12: false
  }).format(new Date(unix * 1000));
};
const setStatus = (text) => {
  const el = $("statusBadge");
  el.textContent = text;
  el.className = "pill px-2 py-0.5 text-xs " + (text === "Live" ? "bg-emerald-700" : text === "Error" ? "bg-rose-700" : "bg-slate-700");
};

function api(url, options={}) {
  const useProxy = !!PROXY_BASE;
  const full = useProxy ? `${PROXY_BASE}${url.replace(BASE_URL, "")}` : url;

  const headers = options.headers || {};
  if (!useProxy && UNSAFE_API_KEY) {
    headers["Server-Key"] = UNSAFE_API_KEY;
    headers["Content-Type"] = "application/json";
  }
  return fetch(full, { ...options, headers });
}

// === Data Fetchers ===
async function fetchStats() {
  const [s, q] = await Promise.all([
    api(BASE_URL),
    api(`${BASE_URL}/queue`)
  ]);
  const server = await s.json();
  const queue = await q.json();
  $("maxPlayers").textContent = server?.MaxPlayers ?? "N/A";
  $("currentPlayers").textContent = server?.CurrentPlayers ?? "N/A";
  $("queueCount").textContent = Array.isArray(queue) ? queue.length : (queue?.length ?? "0");
}

async function fetchJoinLogs() {
  const res = await api(`${BASE_URL}/joinlogs`);
  const json = await res.json();
  const logs = Array.isArray(json) ? json : (json.logs || []);
  renderLogs("joinLogs", logs.slice(-25).reverse(), (log) => {
    const who = (log.Player || "Unknown");
    const isJoin = log.Join ?? true;
    return `<div class="flex items-center gap-2">
      <span class="tag">${isJoin ? "joined" : "left"}</span>
      <span class="text-slate-200">${escapeHtml(who)}</span>
      <span class="text-slate-400 ml-auto text-xs">${fmtTime(log.Timestamp)}</span>
    </div>`;
  });
}

async function fetchCommandLogs() {
  const res = await api(`${BASE_URL}/commandlogs`);
  const json = await res.json();
  const logs = Array.isArray(json) ? json : (json.logs || []);
  renderLogs("commandLogs", logs.slice(-25).reverse(), (log) => {
    return `<div class="flex items-center gap-2">
      <span class="tag">cmd</span>
      <span class="text-slate-200">${escapeHtml(log.Player || "")}</span>
      <span class="text-slate-400">used</span>
      <span class="text-slate-200 font-semibold">${escapeHtml(log.Command || "")}</span>
      <span class="text-slate-400 ml-auto text-xs">${fmtTime(log.Timestamp)}</span>
    </div>`;
  });
}

async function fetchModcalls() {
  const res = await api(`${BASE_URL}/modcalls`);
  const json = await res.json();
  const calls = Array.isArray(json) ? json : (json.modcalls || []);
  const box = $("modcalls");
  box.innerHTML = calls.map((c) => {
    const who = escapeHtml(c.Caller || "Unknown");
    const mod = c.Moderator ? ` • <span class='text-emerald-400'>${escapeHtml(c.Moderator)}</span>` : "";
    return `<div class="p-2 rounded-xl bg-slate-800 border border-slate-700">
      <div class="text-slate-200">${who}${mod}</div>
      <div class="text-slate-400 text-xs">${fmtTime(c.Timestamp)}</div>
    </div>`;
  }).join("");
}

async function fetchVehicles() {
  const res = await api(`${BASE_URL}/vehicles`);
  const json = await res.json();
  const vehicles = Array.isArray(json) ? json : (json.vehicles || []);
  const q = $("searchInput").value.trim().toLowerCase();
  $("vehicles").innerHTML = vehicles
    .filter(v => `${v.Owner||""} ${v.Name||""} ${v.Texture||""}`.toLowerCase().includes(q))
    .map(v => `<div class="p-2 rounded-xl bg-slate-800 border border-slate-700">
      <div class="text-slate-200"><span class="font-semibold">${escapeHtml(v.Owner||"Unknown")}</span> — ${escapeHtml(v.Name||"Unknown")}</div>
      <div class="text-slate-400 text-xs">Texture: ${escapeHtml(v.Texture||"Unknown")}</div>
    </div>`).join("");
}

async function fetchPlayers() {
  const res = await api(`${BASE_URL}/players`);
  const players = await res.json();
  const q = $("searchInput").value.trim().toLowerCase();
  const list = $("playersList");
  const filtered = Array.isArray(players) ? players.filter(p => (p.Player||"").toLowerCase().includes(q)) : [];
  $("playersCount").textContent = filtered.length;
  list.innerHTML = filtered.map((p, i) => {
    const name = escapeHtml(p.Player || "Unknown");
    const perm = escapeHtml(p.Permission || "Unknown");
    const team = escapeHtml(p.Team || "Unknown");
    const callsign = escapeHtml(p.Callsign || "N/A");
    return `<button class="w-full text-left p-3 rounded-xl bg-slate-800 border border-slate-700 hover:border-indigo-500 transition"
              data-idx="${i}" aria-label="Select ${name}">
      <div class="flex items-center justify-between">
        <div class="font-semibold">${name}</div>
        <div class="flex items-center gap-2 text-xs">
          <span class="tag">${perm}</span>
          <span class="tag">${team}</span>
          <span class="tag">Callsign: ${callsign}</span>
        </div>
      </div>
    </button>`;
  }).join("");

  // attach click handlers
  Array.from(list.querySelectorAll("button[data-idx]")).forEach(btn => {
    btn.addEventListener("click", () => selectPlayer(filtered[parseInt(btn.dataset.idx, 10)]));
  });
}

// === Rendering utilities ===
function renderLogs(containerId, items, tmpl) {
  const q = $("searchInput").value.trim().toLowerCase();
  const html = items
    .filter(x => (x.Player || "").toLowerCase().includes(q))
    .map(tmpl).join("");
  $(containerId).innerHTML = html;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (m) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',\"'\":'&#039;'}[m]));
}

// === Player actions ===
let selectedPlayer = null;
function selectPlayer(p) {
  selectedPlayer = p || null;
  if (!p) {
    $("playerActions").classList.add("hidden");
    $("selectedPlayerName").textContent = "";
    return;
  }
  $("playerActions").classList.remove("hidden");
  $("selectedPlayerName").textContent = p.Player || "Unknown";
}

async function sendServerCommand(cmd) {
  if (!cmd) return;
  try {
    const res = await api(`${BASE_URL}/command`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command: cmd })
    });
    if (res.ok) {
      $("commandResult").textContent = "Command sent ✔";
    } else {
      $("commandResult").textContent = `Command failed (${res.status})`;
    }
  } catch (e) {
    $("commandResult").textContent = "Network error";
  } finally {
    setTimeout(() => $("commandResult").textContent = "", 2500);
  }
}

function actionFor(name) {
  if (!selectedPlayer) return null;
  return `${name} ${selectedPlayer.Player}`;
}

// === Wire up UI ===
$("refreshBtn").addEventListener("click", refreshAll);
$("sendCommandBtn").addEventListener("click", () => {
  const v = $("commandInput").value.trim();
  if (v) sendServerCommand(v);
  $("commandInput").value = "";
});
$("pmSendBtn").addEventListener("click", () => {
  if (!selectedPlayer) return;
  const msg = $("pmInput").value.trim();
  if (!msg) return;
  sendServerCommand(`pm ${selectedPlayer.Player} ${msg}`);
  $("pmInput").value = "";
});
document.querySelectorAll("#playerActions button[data-action]").forEach(btn => {
  btn.addEventListener("click", () => {
    const a = btn.getAttribute("data-action");
    const cmd = actionFor(a);
    if (cmd) sendServerCommand(cmd);
  });
});
$("searchInput").addEventListener("input", () => {
  // Re-render from cached last fetch (simpler approach: just refetch)
  refreshAll();
});

async function refreshAll() {
  try {
    setStatus("Loading");
    await Promise.all([
      fetchStats(),
      fetchJoinLogs(),
      fetchCommandLogs(),
      fetchModcalls(),
      fetchVehicles(),
      fetchPlayers()
    ]);
    setStatus("Live");
  } catch (e) {
    console.error(e);
    setStatus("Error");
  }
}

// Auto-refresh timer
setInterval(refreshAll, REFRESH_INTERVAL);
// Initial load
refreshAll();
