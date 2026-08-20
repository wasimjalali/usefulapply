/**
 * One rule for "would Stripe charge this account again", shared by the delete
 * route and the settings pane. Two copies of this would drift, and the failure
 * mode is either billing someone who deleted their account or refusing to let
 * someone leave.
 *
 * Nothing here talks to Stripe. It reads state the webhook already wrote.
 */

/** Statuses Stripe can still take money from. */
export const BILLABLE_SUBSCRIPTION_STATUSES = ['active', 'trialing', 'past_due'] as const;

export interface BillingSubscriptionLike {
  status?: string | null;
  stripe_subscription_id?: string | null;
  cancel_at_period_end?: boolean | null;
}

/**
 * A subscription already set to cancel at the period end is not billed again,
 * so it does not block anything. The user keeps what they paid for until the
 * period runs out, they just do not have to wait to close the account.
 */
export function willBillAgain(subscription: BillingSubscriptionLike | null | undefined): boolean {
  if (!subscription?.stripe_subscription_id) return false;
  if (subscription.cancel_at_period_end) return false;
  const status = subscription.status ?? '';
  return (BILLABLE_SUBSCRIPTION_STATUSES as readonly string[]).includes(status);
}
