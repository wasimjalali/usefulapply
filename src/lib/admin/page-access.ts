import 'server-only';

import { notFound } from 'next/navigation';
import { AdminAccessError } from './access';

export async function loadAdminPageData<T>(load: () => Promise<T>): Promise<T> {
  try {
    return await load();
  } catch (error) {
    if (error instanceof AdminAccessError) notFound();
    throw error;
  }
}
