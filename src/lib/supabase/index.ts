// Re-export all Supabase utilities
export { createClient, getSupabase } from './client';
export type { Database, Tables, InsertTables, UpdateTables } from './types';
export type {
  Profile,
  Document,
  ProfilePhoto,
  ApplicationSession,
  ChatMessage,
  Subscription,
  ConnectedAccount,
} from './types';
