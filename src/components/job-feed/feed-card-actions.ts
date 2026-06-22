type JobFeedCardFitLabel = 'strong' | 'good';
type JobFeedCardGenerationStatus = 'none' | 'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled';

export type JobFeedCardActionKind =
  | 'generate'
  | 'check-fit'
  | 'continue'
  | 'generate-after-fit'
  | 'new-search'
  | 'screening'
  | 'skip-screening'
  | 'retry-generate';

export type JobFeedCardAction = {
  kind: JobFeedCardActionKind;
  label: string;
  variant: 'gold' | 'outline';
};

export type JobFeedCardSessionState = {
  generatedCV: boolean;
  generationStatus?: JobFeedCardGenerationStatus;
  hasFreshPendingFitAnalysis: boolean;
  screeningUsageCount: number;
};

type JobFeedCardFeedbackState = {
  applyStartedAt: string | null;
  appliedAt: string | null;
  generationStatus: JobFeedCardGenerationStatus;
};

export type JobFeedCardActions = {
  badge: 'Application ready' | 'Fit checked' | 'Application started' | 'Generating' | 'Retry available' | null;
  primary: JobFeedCardAction;
  secondary: JobFeedCardAction | null;
  leadWithSecondary: boolean;
};

const GENERATE_ACTION: JobFeedCardAction = {
  kind: 'generate',
  label: 'Generate Kit',
  variant: 'gold',
};

const CHECK_FIT_ACTION: JobFeedCardAction = {
  kind: 'check-fit',
  label: 'Check Fit',
  variant: 'outline',
};

export function isFreshPendingFitAnalysis(createdAt?: string | null, nowMs = Date.now()): boolean {
  if (!createdAt) return false;
  const createdAtMs = new Date(createdAt).getTime();
  if (!Number.isFinite(createdAtMs)) return false;
  return nowMs < createdAtMs + 30 * 60 * 1000;
}

export function getJobFeedCardActions(params: {
  feedback: JobFeedCardFeedbackState;
  session: JobFeedCardSessionState | null;
  isFreeUser: boolean;
  fitLabel: JobFeedCardFitLabel | null;
}): JobFeedCardActions {
  const { feedback, session, isFreeUser, fitLabel } = params;
  const status = session?.generationStatus ?? feedback.generationStatus;
  const hasFreshFitAnalysis = Boolean(
    session?.hasFreshPendingFitAnalysis && !session.generatedCV
  );
  const hasGeneratedKit = Boolean(
    session?.generatedCV ||
    feedback.appliedAt ||
    feedback.generationStatus === 'succeeded' ||
    status === 'succeeded'
  );
  const hasStarted = Boolean(feedback.applyStartedAt);

  if (hasGeneratedKit) {
    const canAskScreening = Boolean(session && session.screeningUsageCount < 2);
    return {
      badge: 'Application ready',
      primary: canAskScreening
        ? {
            kind: 'screening',
            label: 'Answer Screening Questions',
            variant: 'gold',
          }
        : {
            kind: 'continue',
            label: 'Continue in Karko',
            variant: 'gold',
          },
      secondary: canAskScreening
        ? {
            kind: 'skip-screening',
            label: 'Skip For Now',
            variant: 'outline',
          }
        : null,
      leadWithSecondary: false,
    };
  }

  if (hasFreshFitAnalysis) {
    return {
      badge: 'Fit checked',
      primary: {
        kind: 'generate-after-fit',
        label: 'Generate Kit',
        variant: 'gold',
      },
      secondary: {
        kind: 'new-search',
        label: 'New Search',
        variant: 'outline',
      },
      leadWithSecondary: false,
    };
  }

  if (status === 'failed' || status === 'cancelled') {
    return {
      badge: 'Retry available',
      primary: {
        kind: 'retry-generate',
        label: 'Retry Generate Kit',
        variant: 'gold',
      },
      secondary: CHECK_FIT_ACTION,
      leadWithSecondary: false,
    };
  }

  if (status === 'running') {
    return {
      badge: 'Generating',
      primary: {
        kind: 'continue',
        label: 'Continue in Karko',
        variant: 'gold',
      },
      secondary: null,
      leadWithSecondary: false,
    };
  }

  if (hasStarted || status === 'pending') {
    return {
      badge: 'Application started',
      primary: {
        kind: 'continue',
        label: 'Continue in Karko',
        variant: 'gold',
      },
      secondary: null,
      leadWithSecondary: false,
    };
  }

  return {
    badge: null,
    primary: GENERATE_ACTION,
    secondary: CHECK_FIT_ACTION,
    leadWithSecondary: Boolean(isFreeUser && fitLabel !== 'strong'),
  };
}
