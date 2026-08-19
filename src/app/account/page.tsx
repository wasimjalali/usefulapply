import { permanentRedirect } from 'next/navigation';

export default function AccountPage() {
  permanentRedirect('/dashboard?settings=general');
}
