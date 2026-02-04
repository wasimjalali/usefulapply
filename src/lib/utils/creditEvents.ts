/**
 * Credit Events Utility
 * Triggers credit indicator updates after API calls
 */

export const CREDIT_UPDATE_EVENT = 'credit-update';

/**
 * Dispatch a credit update event to refresh the CreditIndicator
 * Call this after any API operation that deducts credits
 */
export function triggerCreditUpdate() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(CREDIT_UPDATE_EVENT));
  }
}
