import { openDB, DBSchema, IDBPDatabase } from 'idb';

interface JobCopilotDB extends DBSchema {
  pdfs: {
    key: string;
    value: {
      id: string;
      cvId: string;
      fileName: string;
      blob: Blob;
      createdAt: string;
      metadata: {
        pageCount: number;
        fileSize: number;
      };
    };
    indexes: { cvId: string };
  };
  'cv-metadata': {
    key: string;
    value: {
      id: string;
      fileName: string;
      lastModified: string;
      pageCount: number;
      region: 'US' | 'EU' | 'other';
    };
  };
}

const DB_NAME = 'job-copilot';
const DB_VERSION = 1;

let dbInstance: IDBPDatabase<JobCopilotDB> | null = null;

async function getDB(): Promise<IDBPDatabase<JobCopilotDB>> {
  if (dbInstance) return dbInstance;

  dbInstance = await openDB<JobCopilotDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('pdfs')) {
        const pdfStore = db.createObjectStore('pdfs', { keyPath: 'id' });
        pdfStore.createIndex('cvId', 'cvId', { unique: false });
      }

      if (!db.objectStoreNames.contains('cv-metadata')) {
        db.createObjectStore('cv-metadata', { keyPath: 'id' });
      }
    },
  });

  return dbInstance;
}

export async function storePDF(
  cvId: string,
  fileName: string,
  blob: Blob,
  pageCount: number
): Promise<string> {
  const db = await getDB();
  const id = `${cvId}-${Date.now()}`;

  await db.put('pdfs', {
    id,
    cvId,
    fileName,
    blob,
    createdAt: new Date().toISOString(),
    metadata: {
      pageCount,
      fileSize: blob.size,
    },
  });

  return id;
}

export async function getPDF(id: string): Promise<Blob | null> {
  const db = await getDB();
  const record = await db.get('pdfs', id);
  return record?.blob || null;
}

export async function getPDFsByCVId(cvId: string): Promise<Array<{
  id: string;
  fileName: string;
  createdAt: string;
  pageCount: number;
  fileSize: number;
}>> {
  const db = await getDB();
  const tx = db.transaction('pdfs', 'readonly');
  const index = tx.store.index('cvId');
  const records = await index.getAll(IDBKeyRange.only(cvId));

  return records.map((r) => ({
    id: r.id,
    fileName: r.fileName,
    createdAt: r.createdAt,
    pageCount: r.metadata.pageCount,
    fileSize: r.metadata.fileSize,
  }));
}

export async function deletePDF(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('pdfs', id);
}

export async function storeCVMetadata(metadata: {
  id: string;
  fileName: string;
  lastModified: string;
  pageCount: number;
  region: 'US' | 'EU' | 'other';
}): Promise<void> {
  const db = await getDB();
  await db.put('cv-metadata', metadata);
}

export async function getCVMetadata(id: string) {
  const db = await getDB();
  return await db.get('cv-metadata', id);
}

export async function getAllCVMetadata() {
  const db = await getDB();
  return await db.getAll('cv-metadata');
}

export async function getStorageUsage(): Promise<{
  used: number;
  available: number;
  percentage: number;
}> {
  if ('storage' in navigator && 'estimate' in navigator.storage) {
    const estimate = await navigator.storage.estimate();
    const used = estimate.usage || 0;
    const available = estimate.quota || 0;
    const percentage = available > 0 ? (used / available) * 100 : 0;

    return { used, available, percentage };
  }

  return { used: 0, available: 0, percentage: 0 };
}

export async function clearOldPDFs(maxAge: number = 7 * 24 * 60 * 60 * 1000): Promise<number> {
  const db = await getDB();
  const tx = db.transaction('pdfs', 'readwrite');
  const allRecords = await tx.store.getAll();
  const now = Date.now();
  let deletedCount = 0;

  for (const record of allRecords) {
    const createdAt = new Date(record.createdAt).getTime();
    if (now - createdAt > maxAge) {
      await tx.store.delete(record.id);
      deletedCount++;
    }
  }

  await tx.done;
  return deletedCount;
}
