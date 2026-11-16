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
import { getFirebaseServices } from "./firebase";

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
 */

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
  const services = await getFirebaseServices();
  if (!services) {
    return loadLocal().sort((a, b) => b.createdAt - a.createdAt);
  }
  const ref = collection(services.db, "users", services.user.uid, "entries");
  const snap = await getDocs(query(ref, orderBy("createdAt", "desc")));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<JournalEntry, "id">) }));
}

export async function addEntry(
  entry: Omit<JournalEntry, "id">,
): Promise<JournalEntry> {
  const services = await getFirebaseServices();
  if (!services) {
    const created: JournalEntry = { ...entry, id: `local-${Date.now()}` };
    const all = loadLocal();
    all.unshift(created);
    saveLocal(all);
    return created;
  }
  const ref = collection(services.db, "users", services.user.uid, "entries");
  const docRef = await addDoc(ref, entry);
  return { ...entry, id: docRef.id };
}

export async function updateEntryAnalysis(
  id: string,
  analysis: EntryAnalysis,
  path: AiPath,
): Promise<void> {
  const services = await getFirebaseServices();
  if (!services) {
    const all = loadLocal();
    const target = all.find((e) => e.id === id);
    if (target) {
      target.analysis = analysis;
      target.analysisPath = path;
      saveLocal(all);
    }
    return;
  }
  const { updateDoc } = await import("firebase/firestore");
  const ref = doc(services.db, "users", services.user.uid, "entries", id);
  await updateDoc(ref, { analysis, analysisPath: path });
}

export async function removeEntry(id: string): Promise<void> {
  const services = await getFirebaseServices();
  if (!services) {
    saveLocal(loadLocal().filter((e) => e.id !== id));
    return;
  }
  await deleteDoc(doc(services.db, "users", services.user.uid, "entries", id));
}

export async function storageMode(): Promise<"firestore" | "local"> {
  return (await getFirebaseServices()) ? "firestore" : "local";
}
