/**
 * Server-only: the applicant's saved start date and salary expectation, read
 * fresh from D1 every time a writer runs (an answer saved after the fit check
 * still counts). Errors are not swallowed: a failed read fails the run, and
 * the credit reservation is released by the caller as for any other failure.
 */
import { getProfile } from '@/db/repos/profiles';
import { logisticsFromProfile, type ApplicantLogistics } from './logistics';

export async function loadApplicantLogistics(userId: string): Promise<ApplicantLogistics> {
  const profile = await getProfile(userId);
  return logisticsFromProfile(profile);
}
