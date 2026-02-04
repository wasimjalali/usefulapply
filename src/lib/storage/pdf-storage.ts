import { openDB, DBSchema, IDBPDatabase } from 'idb';

interface PDFStorageSchema extends DBSchema {
  pdfs: {
    key: string;
    value: {
      id: string;
      fileName: string;
      blob: Blob;
      size: number;
      mimeType: string;
      createdAt: string;
      type: 'original' | 'optimized';
      cvId?: string;
    };
  };
  metadata: {
    key: string;
    value: {
      id: string;
      originalPdfId?: string;
      optimizedPdfId?: string;
      structuredCVId?: string;
      lastAccessed: string;
    };
  };
}

let dbPromise: Promise<IDBPDatabase<PDFStorageSchema>> | null = null;

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB<PDFStorageSchema>('job-copilot-pdfs', 1, {
      upgrade(db) {
        db.createObjectStore('pdfs', { keyPath: 'id' });
        db.createObjectStore('metadata', { keyPath: 'id' });
      },
    });
  }
  return dbPromise;
}

export async function storePDF(
  id: string,
  blob: Blob,
  fileName: string,
  type: 'original' | 'optimized',
  cvId?: string
): Promise<void> {
  const db = await getDB();
  await db.put('pdfs', {
    id,
    fileName,
    blob,
    size: blob.size,
    mimeType: blob.type,
    createdAt: new Date().toISOString(),
    type,
    cvId,
  });
}

export async function getPDF(id: string): Promise<Blob | null> {
  const db = await getDB();
  const record = await db.get('pdfs', id);
  return record?.blob || null;
}

export async function getPDFUrl(id: string): Promise<string | null> {
  const blob = await getPDF(id);
  if (!blob) return null;
  return URL.createObjectURL(blob);
}

export async function deletePDF(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('pdfs', id);
}

export async function getPDFMetadata(id: string) {
  const db = await getDB();
  const record = await db.get('pdfs', id);
  if (!record) return null;
  
  const { blob, ...metadata } = record;
  return metadata;
}

export async function listPDFs() {
  const db = await getDB();
  const all = await db.getAll('pdfs');
  return all.map(({ blob, ...metadata }) => metadata);
}

export async function clearAllPDFs(): Promise<void> {
  const db = await getDB();
  await db.clear('pdfs');
}

export async function getStorageUsed(): Promise<number> {
  const db = await getDB();
  const all = await db.getAll('pdfs');
  return all.reduce((total, record) => total + record.size, 0);
}
