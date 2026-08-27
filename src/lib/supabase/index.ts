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
} from './accounts';
export type { ConnectedAccount, Subscription } from './accounts';

// Feedback operations
export {
  submitMessageFeedback,
  getSessionFeedback,
  getMessageFeedback,
} from './feedback';
export type { MessageFeedback } from './feedback';

// Credit operations.
//
// upgradePlan, processMonthlyReset, processAddonPurchase live in
// credits.server.ts and are intentionally NOT re-exported here. They use
// the service-role client and must be imported directly from the
// server-only module so they never end up in a client bundle.
export {
  CREDIT_COSTS,
  getSubscriptionPlans,
  getAddonCreditPacks,
  getUserCredits,
  getTotalCredits,
  getCreditTransactions,
} from './credits';
export type {
  UserCredits,
  CreditTransaction,
  SubscriptionPlan,
  AddonCreditPack,
  CreditAction,
} from './credits';
