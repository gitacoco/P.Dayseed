import type { DayseedSnapshot } from "@/types/dayseed";

const DB_NAME = "dayseed-mvp";
const STORE_NAME = "snapshots";
const SNAPSHOT_KEY = "main";
const DB_VERSION = 1;

function openDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is not available in this environment."));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

export async function loadDayseedSnapshot() {
  try {
    const db = await openDb();

    return await new Promise<DayseedSnapshot | null>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(SNAPSHOT_KEY);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve((request.result as DayseedSnapshot) ?? null);
      transaction.oncomplete = () => db.close();
    });
  } catch {
    if (typeof window !== "undefined") {
      const fallback = window.localStorage.getItem("dayseed-mvp");
      return fallback ? (JSON.parse(fallback) as DayseedSnapshot) : null;
    }

    return null;
  }
}

export async function saveDayseedSnapshot(snapshot: DayseedSnapshot) {
  try {
    const db = await openDb();

    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(snapshot, SNAPSHOT_KEY);

      request.onerror = () => reject(request.error);
      transaction.onerror = () => reject(transaction.error);
      transaction.oncomplete = () => {
        db.close();
        resolve();
      };
    });
  } catch {
    window.localStorage.setItem("dayseed-mvp", JSON.stringify(snapshot));
  }
}
