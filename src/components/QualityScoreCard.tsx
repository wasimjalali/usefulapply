'use client';

import { 
  CheckCircle2, 
  AlertTriangle,
  TrendingUp,
  Target,
  FileText,
  Zap,
  Award,
} from 'lucide-react';

interface QualityCriteria {
  keywordCoverage: { score: number; feedback: string };
  characterLimits: { score: number; feedback: string };
  actionVerbs: { score: number; feedback: string };
  quantifiedResults: { score: number; feedback: string };
  atsCompatibility: { score: number; feedback: string };
}

interface QualityScoreCardProps {
  overallScore: number;
  passed: boolean;
  criteria?: QualityCriteria;
  improvements?: string[];
  matchScore?: number;
  compact?: boolean;
}

const CRITERIA_LABELS: Record<keyof QualityCriteria, { label: string; icon: React.ElementType }> = {
  keywordCoverage: { label: 'Keywords', icon: Target },
  characterLimits: { label: 'Length', icon: FileText },
  actionVerbs: { label: 'Action Verbs', icon: Zap },
  quantifiedResults: { label: 'Metrics', icon: TrendingUp },
  atsCompatibility: { label: 'ATS Ready', icon: Award },
};

export function QualityScoreCard({ 
  overallScore, 
  passed, 
  criteria, 
  improvements,
  matchScore,
  compact = false,
}: QualityScoreCardProps) {
  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-amber-600';
    return 'text-red-500';
  };

  const getScoreBg = (score: number) => {
    if (score >= 80) return 'bg-green-100';
    if (score >= 60) return 'bg-amber-100';
    return 'bg-red-100';
  };

  const getProgressColor = (score: number) => {
    if (score >= 0.8) return 'bg-green-500';
    if (score >= 0.6) return 'bg-amber-500';
    return 'bg-red-500';
  };

  if (compact) {
    return (
      <div className="flex items-center gap-3 p-3 bg-white rounded-lg border border-cream-200">
        <div className={`flex items-center justify-center w-12 h-12 rounded-full ${getScoreBg(overallScore)}`}>
          <span className={`text-lg font-bold ${getScoreColor(overallScore)}`}>
            {overallScore}
          </span>
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            {passed ? (
              <CheckCircle2 className="w-4 h-4 text-green-600" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-amber-500" />
            )}
            <span className="text-sm font-medium text-charcoal">
              {passed ? 'Quality Passed' : 'Needs Improvement'}
            </span>
          </div>
          {matchScore !== undefined && (
            <p className="text-xs text-warm-gray mt-0.5">
              Job Match: {matchScore}%
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-cream-200 overflow-hidden">
      {/* Header with overall score */}
      <div className="p-4 border-b border-cream-200 bg-gradient-to-r from-cream-50 to-white">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-charcoal">Quality Score</h3>
            <p className="text-xs text-warm-gray mt-0.5">
              {passed ? 'Your CV meets quality standards' : 'Some areas need attention'}
            </p>
          </div>
          <div className={`flex items-center justify-center w-16 h-16 rounded-full ${getScoreBg(overallScore)}`}>
            <div className="text-center">
              <span className={`text-2xl font-bold ${getScoreColor(overallScore)}`}>
                {overallScore}
              </span>
              <span className={`text-xs ${getScoreColor(overallScore)}`}>%</span>
            </div>
          </div>
        </div>

        {/* Match score if available */}
        {matchScore !== undefined && (
          <div className="mt-3 flex items-center gap-2">
            <Target className="w-4 h-4 text-gold" />
            <span className="text-sm text-charcoal">Job Match:</span>
            <span className={`text-sm font-semibold ${getScoreColor(matchScore)}`}>
              {matchScore}%
            </span>
          </div>
        )}
      </div>

      {/* Criteria breakdown */}
      {criteria && (
        <div className="p-4 space-y-3">
          <h4 className="text-xs font-medium text-warm-gray uppercase tracking-wide">
            Quality Criteria
          </h4>
          {Object.entries(criteria).map(([key, value]) => {
            const criteriaKey = key as keyof QualityCriteria;
            const { label, icon: Icon } = CRITERIA_LABELS[criteriaKey];
            const scorePercent = Math.round(value.score * 100);
            
            return (
              <div key={key} className="space-y-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Icon className="w-3.5 h-3.5 text-warm-gray" />
                    <span className="text-sm text-charcoal">{label}</span>
                  </div>
                  <span className={`text-sm font-medium ${getScoreColor(scorePercent)}`}>
                    {scorePercent}%
                  </span>
                </div>
                <div className="h-1.5 bg-cream-200 rounded-full overflow-hidden">
                  <div 
                    className={`h-full ${getProgressColor(value.score)} transition-all duration-500`}
                    style={{ width: `${scorePercent}%` }}
                  />
                </div>
                {value.score < 0.8 && (
                  <p className="text-xs text-warm-gray">{value.feedback}</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Improvements */}
      {improvements && improvements.length > 0 && (
        <div className="p-4 bg-amber-50 border-t border-amber-100">
          <h4 className="text-xs font-medium text-amber-800 uppercase tracking-wide mb-2">
            Suggested Improvements
          </h4>
          <ul className="space-y-1">
            {improvements.slice(0, 3).map((improvement, idx) => (
              <li key={idx} className="text-xs text-amber-700 flex items-start gap-2">
                <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                <span>{improvement}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
