import {
  analyzeEntry,
  getEngineMode,
  getEngineStatus,
  reflectOnEntries,
  setEngineMode,
} from "./ai/hybrid";
import type { AiPath, EngineMode, EngineStatus } from "./ai/types";
import { getFirebaseServices } from "./lib/firebase";
import {
  addEntry,
  loadEntries,
  removeEntry,
  storageMode,
  updateEntryAnalysis,
  type JournalEntry,
  type StorageMode,
} from "./lib/store";
import "./style.css";

const MOODS = ["Calm", "Happy", "Grateful", "Proud", "Reflective", "Tired", "Anxious", "Sad"];

const state = {
  entries: [] as JournalEntry[],
  status: null as EngineStatus | null,
  storage: "local" as StorageMode,
  busy: false,
  reflection: "" as string,
  reflectionMeta: "" as string,
};

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function pathBadge(path: AiPath | null): string {
  if (!path) return "";
  const map: Record<AiPath, { cls: string; label: string }> = {
    ondevice: { cls: "badge-device", label: "On-device · Gemini Nano" },
    cloud: { cls: "badge-cloud", label: "Cloud · Firebase AI Logic" },
    demo: { cls: "badge-demo", label: "Demo engine" },
  };
  const b = map[path];
  return `<span class="badge ${b.cls}">${b.label}</span>`;
}

function sentimentClass(score: number): string {
  if (score >= 0.25) return "sent-pos";
  if (score <= -0.25) return "sent-neg";
  return "sent-mid";
}

function renderApp(): void {
  const root = document.getElementById("app");
  if (!root) return;
  const status = state.status;
  const mode = getEngineMode();

  const trend = state.entries.slice(0, 7).reverse();
  const trendHtml = trend.length
    ? trend
        .map((e) => {
          const score = e.analysis?.sentimentScore ?? 0;
          const h = Math.round(28 + score * 24);
          return `<div class="trend-col" title="${esc(e.title)} (${score.toFixed(2)})">
            <div class="trend-bar ${sentimentClass(score)}" style="height:${h}px"></div>
            <span>${new Date(e.createdAt).toLocaleDateString(undefined, { weekday: "narrow" })}</span>
          </div>`;
        })
        .join("")
    : `<p class="muted">Analyse entries to see your mood trend.</p>`;

  root.innerHTML = `
  <header class="topbar">
    <div class="brand">
      <div class="logo">R</div>
      <div>
        <h1>Reflekt</h1>
        <p>Private AI journal — thinks on your device first</p>
      </div>
    </div>
    <span class="badge ${state.storage === "firestore" ? "badge-cloud" : "badge-demo"}">
      ${state.storage === "firestore" ? "Synced · Firestore" : state.storage === "cloud-unavailable" ? "Local mode · cloud sync unavailable" : "Demo mode · local storage"}
    </span>
  </header>

  <main class="layout">
    <section class="column-main">
      <div class="card composer">
        <h2>New entry</h2>
        <input id="f-title" type="text" placeholder="Give today a title…" maxlength="120" />
        <div class="row">
          <label class="mood-label">Mood
            <select id="f-mood">
              ${MOODS.map((m) => `<option value="${m}">${m}</option>`).join("")}
            </select>
          </label>
        </div>
        <textarea id="f-body" rows="7" placeholder="Write freely. When you ask for a summary, Reflekt tries Gemini Nano on this device first — your words don't have to leave it."></textarea>
        <div class="row actions">
          <button id="btn-save" class="primary" ${state.busy ? "disabled" : ""}>Save &amp; analyse</button>
          <span class="muted" id="save-hint"></span>
        </div>
      </div>

      <div class="card">
        <div class="row spread">
          <h2>Deep reflection</h2>
          <button id="btn-reflect" class="ghost" ${state.busy ? "disabled" : ""}>Reflect on my week</button>
        </div>
        <p class="muted">A longer look across your recent entries. This is the heavy task —
        in Auto mode it goes to Gemini in the cloud via Firebase AI Logic, because it needs
        long context across many entries at once.</p>
        <div id="reflection-out">
          ${
            state.reflection
              ? `<div class="reflection-text">${esc(state.reflection).replace(/\n{2,}/g, "<br/><br/>")}</div>
                 <p class="reason">${esc(state.reflectionMeta)}</p>`
              : `<p class="muted">No reflection yet — write a few entries, then ask.</p>`
          }
        </div>
      </div>

      <div id="entries">
        ${state.entries.map(entryHtml).join("") || `<div class="card"><p class="muted">No entries yet.</p></div>`}
      </div>
    </section>

    <aside class="column-side">
      <div class="card engine" id="engine-panel">
        <h2>Hybrid Engine</h2>
        <div class="engine-row">
          <span class="dot ${status && status.onDeviceState === "available" ? "dot-on" : status && (status.onDeviceState === "downloadable" || status.onDeviceState === "downloading") ? "dot-warn" : "dot-off"}"></span>
          <div>
            <strong>On-device · Gemini Nano</strong>
            <p class="muted" id="od-detail">${status ? esc(status.onDeviceDetail) : "Checking…"}</p>
          </div>
        </div>
        <div class="engine-row">
          <span class="dot ${status?.cloudReady ? "dot-on" : "dot-off"}"></span>
          <div>
            <strong>Cloud · Firebase AI Logic</strong>
            <p class="muted" id="cloud-detail">${status ? esc(status.cloudDetail) : "Checking…"}</p>
          </div>
        </div>
        <div class="mode-switch" role="group" aria-label="Engine mode">
          ${(["auto", "ondevice", "cloud"] as EngineMode[])
            .map(
              (m) =>
                `<button data-mode="${m}" class="${mode === m ? "active" : ""}">${m === "auto" ? "Auto" : m === "ondevice" ? "On-device" : "Cloud"}</button>`,
            )
            .join("")}
        </div>
        <p class="muted small">Auto = private first for single entries, cloud for deep reflection.
        Every AI result is labelled with the path that actually produced it.</p>
      </div>

      <div class="card">
        <h2>Mood trend</h2>
        <div class="trend">${trendHtml}</div>
      </div>

      <div class="card about">
        <h2>How Reflekt works</h2>
        <p class="muted">Summaries, themes and sentiment are computed by <strong>Gemini Nano on your
        device</strong> whenever Chrome's built-in AI is available — offline, instant, and private.
        Only when you ask for a deep reflection does Reflekt call <strong>Gemini in the cloud through
        Firebase AI Logic</strong>, the Firebase GenAI client SDK. Entries sync through Firestore
        with Anonymous Auth; feature flags and routing limits come from Remote Config, and requests
        are attested with App Check.</p>
      </div>
    </aside>
  </main>
  <footer class="foot muted">Built for #BuildHybridAI 2026 · Firebase AI Logic + Chrome Built-in AI (Gemini Nano)</footer>
  `;

  wireEvents();
}

function entryHtml(e: JournalEntry): string {
  const a = e.analysis;
  return `
  <article class="card entry" data-id="${e.id}">
    <div class="row spread">
      <h3>${esc(e.title)}</h3>
      ${pathBadge(e.analysisPath)}
    </div>
    <p class="meta muted">${new Date(e.createdAt).toLocaleString()} · Mood: ${esc(e.mood)}</p>
    <p class="body">${esc(e.body)}</p>
    ${
      a
        ? `<div class="analysis">
             <p><strong>Summary.</strong> ${esc(a.summary)}</p>
             <div class="chips">
               ${a.themes.map((t) => `<span class="chip">${esc(t)}</span>`).join("")}
               <span class="chip ${sentimentClass(a.sentimentScore)}">${esc(a.sentiment)} · ${a.sentimentScore.toFixed(2)}</span>
             </div>
           </div>`
        : `<button class="ghost btn-analyse" data-id="${e.id}">Analyse with AI</button>`
    }
    <div class="row actions">
      <button class="danger btn-delete" data-id="${e.id}">Delete</button>
    </div>
  </article>`;
}

function wireEvents(): void {
  document.getElementById("btn-save")?.addEventListener("click", onSave);
  document.getElementById("btn-reflect")?.addEventListener("click", onReflect);
  document.querySelectorAll<HTMLButtonElement>("[data-mode]").forEach((btn) => {
    btn.addEventListener("click", () => {
      setEngineMode(btn.dataset.mode as EngineMode);
      void refreshStatus().then(renderApp);
    });
  });
  document.querySelectorAll<HTMLButtonElement>(".btn-analyse").forEach((btn) => {
    btn.addEventListener("click", () => void onAnalyse(btn.dataset.id ?? ""));
  });
  document.querySelectorAll<HTMLButtonElement>(".btn-delete").forEach((btn) => {
    btn.addEventListener("click", () => void onDelete(btn.dataset.id ?? ""));
  });
}

async function onSave(): Promise<void> {
  const title = (document.getElementById("f-title") as HTMLInputElement).value.trim();
  const body = (document.getElementById("f-body") as HTMLTextAreaElement).value.trim();
  const mood = (document.getElementById("f-mood") as HTMLSelectElement).value;
  const hint = document.getElementById("save-hint");
  if (!body) {
    if (hint) hint.textContent = "Write something first 🙂";
    return;
  }
  state.busy = true;
  renderApp();
  try {
    const entry = await addEntry({
      title: title || "Untitled entry",
      body,
      mood,
      createdAt: Date.now(),
      analysis: null,
      analysisPath: null,
    });
    state.entries.unshift(entry);
    const result = await analyzeEntry(body);
    entry.analysis = result.data;
    entry.analysisPath = result.path;
    await updateEntryAnalysis(entry.id, result.data, result.path);
  } finally {
    state.busy = false;
    renderApp();
  }
}

async function onAnalyse(id: string): Promise<void> {
  const entry = state.entries.find((e) => e.id === id);
  if (!entry || state.busy) return;
  state.busy = true;
  renderApp();
  try {
    const result = await analyzeEntry(entry.body);
    entry.analysis = result.data;
    entry.analysisPath = result.path;
    await updateEntryAnalysis(entry.id, result.data, result.path);
  } finally {
    state.busy = false;
    renderApp();
  }
}

async function onDelete(id: string): Promise<void> {
  await removeEntry(id);
  state.entries = state.entries.filter((e) => e.id !== id);
  renderApp();
}

async function onReflect(): Promise<void> {
  if (state.busy || state.entries.length === 0) return;
  state.busy = true;
  renderApp();
  try {
    const recent = state.entries.slice(0, 7);
    const result = await reflectOnEntries(
      recent.map((e) => ({
        title: e.title,
        body: e.body,
        mood: e.mood,
        sentimentScore: e.analysis?.sentimentScore ?? 0,
        createdAt: e.createdAt,
      })),
    );
    state.reflection = result.data;
    state.reflectionMeta = `${result.path === "ondevice" ? "On-device" : result.path === "cloud" ? "Cloud" : "Demo engine"} · ${result.reason}`;
  } finally {
    state.busy = false;
    renderApp();
  }
}

async function refreshStatus(): Promise<void> {
  state.status = await getEngineStatus();
}

async function boot(): Promise<void> {
  renderApp();
  // loadEntries() runs first on purpose: if Firestore rejects the read it
  // flips the store into its local fallback, and storageMode() — called
  // afterwards — then honestly reports "cloud-unavailable" instead of
  // claiming the app is synced. Every step is individually guarded so a
  // storage or Firebase failure can never freeze the first render with the
  // engine panel stuck on "Checking…".
  try {
    state.entries = await loadEntries();
  } catch (err) {
    console.warn("[Reflekt] Could not load entries; starting with an empty journal:", err);
    state.entries = [];
  }
  state.storage = await storageMode().catch(() => "local" as StorageMode);
  try {
    await refreshStatus();
  } catch (err) {
    console.warn("[Reflekt] Engine status check failed:", err);
    state.status = {
      onDeviceState: "unavailable",
      onDeviceDetail: "Status check failed — see console.",
      cloudReady: false,
      cloudDetail: "Status check failed — see console.",
      mode: getEngineMode(),
    };
  }
  renderApp();

  // Debug/testing hook: lets a headless browser verify hybrid detection.
  const w = window as unknown as Record<string, unknown>;
  w["__reflekt"] = {
    getStatus: () => state.status,
    analyzeEntry,
    servicesReady: async () => (await getFirebaseServices()) !== null,
  };
  document.body.dataset.engineReady = "true";
}

void boot();
