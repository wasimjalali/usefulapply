import { STORAGE, signedInContext } from './auth';
import { TEST_EMAIL, seedKit, userIdFor } from './seed';

/** Signs the test account in once, saves the session for the browser, and seeds one application with a full kit. */
export default async function globalSetup() {
  const api = await signedInContext(TEST_EMAIL, 'Jordan Ellis', STORAGE);
  await api.dispose();
  seedKit(userIdFor(TEST_EMAIL));
}
