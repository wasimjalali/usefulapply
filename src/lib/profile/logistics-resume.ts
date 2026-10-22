/**
 * The two decisions behind resuming a kit that was parked for the start date
 * and salary questions. Pure so they can be tested without rendering.
 */

/**
 * A parked kit runs only for the application it was parked on, and only when
 * no other run is working, so credits can't be spent twice.
 */
export function parkedRunStillValid(
  parkedSessionId: string | null,
  currentSessionId: string | null,
  isAgentWorking: boolean,
): boolean {
  return parkedSessionId === currentSessionId && !isAgentWorking;
}

/**
 * Where the guided line goes back to when the parked kit can't run: the fit
 * result when there is one (its Generate button keeps the after-fit price),
 * otherwise the job step.
 */
export function stepAfterDroppedResume(hasPendingFit: boolean): 'fit-result' | 'job' {
  return hasPendingFit ? 'fit-result' : 'job';
}
