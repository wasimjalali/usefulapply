export interface ApplicantJourneyStage {
  id: string;
  label: string;
  value: string;
  rateToNext?: string;
}

export interface ApplicantJourneyRailProps {
  stages: ApplicantJourneyStage[];
  ariaLabel: string;
}

export function ApplicantJourneyRail({ stages, ariaLabel }: ApplicantJourneyRailProps) {
  return (
    <ol className="admin-journey" aria-label={ariaLabel}>
      {stages.map((stage, index) => (
        <li className="admin-journey__stage" key={stage.id}>
          <div className="admin-journey__node" aria-hidden="true" />
          <strong>{stage.value}</strong>
          <span>{stage.label}</span>
          {index < stages.length - 1 ? (
            <div
              className="admin-journey__connector"
              role={stage.rateToNext ? 'note' : undefined}
              aria-label={stage.rateToNext ? `${stage.rateToNext} to next stage` : undefined}
            >
              {stage.rateToNext ? <span aria-hidden="true">{stage.rateToNext}</span> : null}
            </div>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
