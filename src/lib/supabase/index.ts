// Re-export all Supabase utilities
export { createClient, getSupabase } from './client';
export type { Database, Tables, InsertTables, UpdateTables } from './types';
export type {
  Profile,
  Document as ProfileDocument,
  ProfilePhoto,
  ApplicationSession as ProfileApplicationSession,
  ChatMessage as ProfileChatMessage,
  Subscription,
  ConnectedAccount,
} from './types';

// Document operations
export {
  getDocuments,
  getDocumentByType,
  saveDocument,
  deleteDocument,
  uploadCVFile,
} from './documents';
export type { Document } from './documents';

// Session operations
export {
  getSessions,
  getSession,
  createSession,
  updateSession,
  deleteSession,
  getChatMessages,
  addChatMessage,
  clearChatMessages,
} from './sessions';
export type { ApplicationSession, ChatMessage } from './sessions';

// Storage operations
export { uploadAvatar, deleteAvatar } from './storage';
