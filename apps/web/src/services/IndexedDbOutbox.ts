export interface PendingWrite {
  id: string; // uuid client-side
  sessionId: string;
  role: "user" | "assistant" | "system";
  content: string;
  emotion?: string;
  animation?: string;
  expression?: string;
  createdAt: string;
}

const DB_NAME = "animeBuddyOffline";
const STORE_NAME = "outbox";
const DB_VERSION = 1;

export class IndexedDbOutbox {
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    if (this.db) return;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(STORE_NAME)) {
          database.createObjectStore(STORE_NAME, { keyPath: "id" });
        }
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onerror = () => {
        reject(new Error("Failed to open IndexedDB outbox"));
      };
    });
  }

  async add(write: Omit<PendingWrite, "id"> & { id?: string }): Promise<PendingWrite> {
    await this.ensureDb();
    const entry: PendingWrite = {
      ...write,
      id: write.id || crypto.randomUUID()
    };

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(entry);

      request.onsuccess = () => resolve(entry);
      request.onerror = () => reject(request.error);
    });
  }

  async getAll(): Promise<PendingWrite[]> {
    await this.ensureDb();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(STORE_NAME, "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  async remove(id: string): Promise<void> {
    await this.ensureDb();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  private async ensureDb(): Promise<void> {
    if (!this.db) {
      await this.init();
    }
  }
}
