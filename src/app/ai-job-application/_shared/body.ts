import type { ReactNode } from 'react';

/**
 * Collects a section's body elements into a plain array. Written as a call
 * (not an array literal) so the elements need no keys: GeoPage spreads them
 * back out as static children, which keeps the rendered tree identical to the
 * hand-written pages it replaced.
 */
export const body = (...nodes: ReactNode[]): ReactNode[] => nodes;
