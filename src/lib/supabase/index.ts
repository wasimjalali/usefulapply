// Re-export all Supabase utilities
export { createClient, getSupabase } from './client';
export type { Database, Tables, InsertTables, UpdateTables } from './types';
export type {
  Profile,
  Document as ProfileDocument,
  ProfilePhoto,
  ApplicationSession as ProfileApplicationSession,
  ChatMessage as ProfileChatMessage,
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
export { 
  uploadAvatar, 
  deleteAvatar,
  uploadProfilePhoto,
  getProfilePhotoUrl,
  deleteProfilePhoto,
  uploadGeneratedPDF,
  getGeneratedPDFUrl,
  listGeneratedPDFs,
  deleteGeneratedPDF,
} from './storage';

// Account operations
export {
  getConnectedAccounts,
  disconnectAccount,
  getSubscription,
  createFreeSubscription,
  canCreateApplication,
  changePassword,
  sendPasswordResetEmail,
  connectOAuthProvider,
  deleteUserAccount,
} from './accounts';
export type { ConnectedAccount, Subscription } from './accounts';

// Feedback operations
export {
  submitMessageFeedback,
  getSessionFeedback,
  getMessageFeedback,
} from './feedback';
export type { MessageFeedback } from './feedback';

// Credit operations
export {
  CREDIT_COSTS,
  getSubscriptionPlans,
  getSubscriptionPlan,
  getAddonCreditPacks,
  getUserCredits,
  getTotalCredits,
  hasEnoughCredits,
  checkCreditBalance,
  deductCredits,
  addCredits,
  upgradePlan,
  processMonthlyReset,
  getCreditTransactions,
  processAddonPurchase,
} from './credits';
export type {
  UserCredits,
  CreditTransaction,
  SubscriptionPlan,
  AddonCreditPack,
  CreditAction,
} from './credits';
