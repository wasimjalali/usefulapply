if (typeof window !== 'undefined') {
  throw new Error(
    'credits.server.ts must not be imported on the client. Use src/lib/supabase/credits.ts for reads.',
  );
}

export {
  upgradePlan,
  processMonthlyReset,
  processAddonPurchase,
} from '@/db/repos/credits';
