/**
 * Client-safe credit helpers. Mutations live in src/db/repos/credits.ts
 * and are imported only from server code.
 */
export { getTotalCredits } from '@/lib/credit-costs';
export type { UserCredits, CreditTransaction } from '@/db/repos/credits';

export {
  getUserCreditsAction as getUserCredits,
  getCreditTransactionsAction as getCreditTransactions,
} from '@/db/actions';


