import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireAdminAccess } from '@/lib/admin/access';
import { AdminAccessError } from '@/lib/admin/access';
import { AdminNavigationShell } from './_components';

export const metadata: Metadata = {
  title: 'Admin | Useful Apply',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function AdminDashboardLayout({ children }: { children: React.ReactNode }) {
  try {
    await requireAdminAccess();
  } catch (error) {
    if (error instanceof AdminAccessError) notFound();
    throw error;
  }

  return <AdminNavigationShell>{children}</AdminNavigationShell>;
}
