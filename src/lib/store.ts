import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
} from "firebase/firestore";
import type { AiPath, EntryAnalysis } from "../ai/types";
import { getFirebaseServices, type FirebaseServices } from "./firebase";
import { isFirebaseConfigured } from "./firebase-config";

export interface JournalEntry {
  id: string;
  title: string;
  body: string;
  mood: string;
  createdAt: number;
  analysis: EntryAnalysis | null;
  analysisPath: AiPath | null;
}

const LS_KEY = "reflekt.entries.v1";

const SEED_ENTRIES: Omit<JournalEntry, "id">[] = [
  {
    title: "A slow morning that actually worked",
    body: "Woke up before my alarm and didn't reach for my phone. Made coffee, sat on the balcony, and watched the street wake up. I finished the report draft in one focused hour afterwards — proof that rest is not the opposite of progress. I want more mornings like this, even if it means saying no to late nights more often.",
    mood: "Calm",
    createdAt: Date.now() - 1000 * 60 * 60 * 26,
    analysis: null,
    analysisPath: null,
  },
  {
    title: "The presentation is done",
    body: "The client presentation finally happened today. I was anxious all week, rehearsing answers to questions that never came. It went well — better than well. Funny how the worry is always louder than the event itself. Note to self: prepare, then trust the preparation. Celebrated with noodles from the place near the office.",
    mood: "Proud",
    createdAt: Date.now() - 1000 * 60 * 60 * 5,
    analysis: null,
    analysisPath: null,
  },
];

/**
 * Entry storage: Firestore (`users/{uid}/entries`) when a real Firebase
 * config is present, localStorage in demo mode. Same interface either way.
 *
 * Resilience: if Firestore rejects an operation — most commonly because the
 * security rules have not been published yet and still deny everything —
 * the store permanently falls back to localStorage for the session instead
 * of letting the error crash the caller, and storageMode() then honestly
 * reports "cloud-unavailable" rather than claiming the app is synced.
 */

/**
 * Flips to true the first time a Firestore operation is rejected. From then
 * on every store operation goes straight to the local path.
 */
let cloudStorageFailed = false;

/**
 * Run `op` against Firestore when services are available; on ANY rejection
 * mark cloud storage as failed and run the localStorage equivalent instead.
 */
async function withCloud<T>(
  op: (services: FirebaseServices) => Promise<T>,
  local: () => T | Promise<T>,
): Promise<T> {
  const services = cloudStorageFailed ? null : await getFirebaseServices();
  if (!services) return local();
  try {
    return await op(services);
  } catch (err) {
    cloudStorageFailed = true;
    console.warn(
      "[Reflekt] Cloud storage unavailable (Firestore rejected the operation); switching to local storage:",
      err,
    );
    return local();
  }
}

function loadLocal(): JournalEntry[] {
  const raw = localStorage.getItem(LS_KEY);
  if (raw === null) {
    const seeded = SEED_ENTRIES.map((e, i) => ({ ...e, id: `seed-${i}` }));
    localStorage.setItem(LS_KEY, JSON.stringify(seeded));
    return seeded;
  }
  try {
    return JSON.parse(raw) as JournalEntry[];
  } catch {
    return [];
  }
}

function saveLocal(entries: JournalEntry[]): void {
  localStorage.setItem(LS_KEY, JSON.stringify(entries));
}

export async function loadEntries(): Promise<JournalEntry[]> {
  return withCloud(
    async (services) => {
      const ref = collection(services.db, "users", services.user.uid, "entries");
      const snap = await getDocs(query(ref, orderBy("createdAt", "desc")));
      return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<JournalEntry, "id">) }));
    },
    () => loadLocal().sort((a, b) => b.createdAt - a.createdAt),
  );
}

export async function addEntry(
  entry: Omit<JournalEntry, "id">,
): Promise<JournalEntry> {
  return withCloud(
    async (services) => {
      const ref = collection(services.db, "users", services.user.uid, "entries");
      const docRef = await addDoc(ref, entry);
      return { ...entry, id: docRef.id };
    },
    () => {
      const created: JournalEntry = { ...entry, id: `local-${Date.now()}` };
      const all = loadLocal();
      all.unshift(created);
      saveLocal(all);
      return created;
    },
  );
}

export async function updateEntryAnalysis(
  id: string,
  analysis: EntryAnalysis,
  path: AiPath,
): Promise<void> {
  await withCloud(
    async (services) => {
      const { updateDoc } = await import("firebase/firestore");
      const ref = doc(services.db, "users", services.user.uid, "entries", id);
      await updateDoc(ref, { analysis, analysisPath: path });
    },
    () => {
      const all = loadLocal();
      const target = all.find((e) => e.id === id);
      if (target) {
        target.analysis = analysis;
        target.analysisPath = path;
        saveLocal(all);
      }
    },
  );
}

export async function removeEntry(id: string): Promise<void> {
  await withCloud(
    async (services) => {
      await deleteDoc(doc(services.db, "users", services.user.uid, "entries", id));
    },
    () => {
      saveLocal(loadLocal().filter((e) => e.id !== id));
    },
  );
}

export type StorageMode = "firestore" | "local" | "cloud-unavailable";

export async function storageMode(): Promise<StorageMode> {
  // No real config at all: genuine demo mode.
  if (!isFirebaseConfigured) return "local";
  // Config exists but Firestore already rejected an operation this session.
  if (cloudStorageFailed) return "cloud-unavailable";
  // Config exists but Firebase itself failed to initialise (offline,
  // blocked, …): also honestly "cloud unavailable", never "synced".
  return (await getFirebaseServices()) ? "firestore" : "cloud-unavailable";
}
