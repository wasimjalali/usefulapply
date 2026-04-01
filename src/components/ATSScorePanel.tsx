'use client';

import { Card } from './ui/Card';
import { useAppStore } from '@/store/useAppStore';
import { TrendingUp, Sparkles, CheckCircle, FileOutput } from 'lucide-react';

export function ATSScorePanel() {
  const { currentSession, isAgentWorking, isGenerating, isAnalyzing } = useAppStore();

  const generatedCV = currentSession?.generatedCV;
  const optimizedCVData = currentSession?.optimizedCVData;
  const changes = generatedCV?.changes || [];

  const isLoading = isAgentWorking || isGenerating || isAnalyzing;

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-sm text-warm-gray">Generating analysis...</p>
      </div>
    );
  }

  if (!generatedCV && !optimizedCVData) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center p-8">
        <div className="w-16 h-16 rounded-2xl bg-cream-100 flex items-center justify-center mx-auto mb-5">
          <Sparkles className="w-8 h-8 text-cream-400" />
        </div>
        <h3 className="text-lg font-semibold text-charcoal mb-2">No ATS analysis yet</h3>
        <p className="text-sm text-warm-gray max-w-sm leading-relaxed">
          Paste a job description in the chat and apply for the role to get your ATS compatibility score and optimization breakdown.
        </p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto p-6">
      {optimizedCVData?.analysis ? (
        <div className="space-y-6">
          {/* ATS Compatibility Score */}
          <div className="bg-white rounded-2xl border border-cream-200 shadow-sm p-6">
            <h3 className="font-bold text-navy-800 mb-4 text-lg">ATS Compatibility Score</h3>
            <div className="flex items-center gap-4">
              <div className="flex-1 bg-cream-200 rounded-full h-4">
                <div
                  className="bg-gradient-to-r from-gold-400 to-gold-500 h-4 rounded-full transition-all duration-700"
                  style={{ width: `${optimizedCVData.analysis.ats_compatibility}%` }}
                />
              </div>
              <span className="font-bold text-navy-700 text-2xl min-w-[3rem] text-right">
                {optimizedCVData.analysis.ats_compatibility}%
              </span>
            </div>
          </div>

          {/* Optimization Strategy */}
          <div className="bg-gradient-to-r from-navy-50 to-navy-100 p-5 rounded-2xl border border-navy-200">
            <h3 className="font-bold text-navy-800 mb-2 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-gold-600" />
              Optimization Strategy
            </h3>
            <p className="text-navy-700 text-sm leading-relaxed">{optimizedCVData.analysis.summary}</p>
          </div>

          {/* Key Improvements */}
          <div>
            <h3 className="font-bold mb-3 flex items-center gap-2 text-navy-800 text-base">
              <Sparkles className="w-5 h-5 text-gold-500" />
              Key Improvements Made
            </h3>
            <ul className="space-y-2">
              {optimizedCVData.analysis.key_changes.map((change, i) => (
                <li key={i} className="flex items-start gap-3 p-4 bg-white rounded-xl border border-cream-200 shadow-sm">
                  <CheckCircle className="w-5 h-5 text-gold-500 mt-0.5 flex-shrink-0" />
                  <span className="text-sm text-charcoal leading-relaxed">{change}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Keywords Added */}
          {optimizedCVData.analysis.missing_keywords_added.length > 0 && (
            <div>
              <h3 className="font-bold mb-3 text-navy-800 text-base">Keywords Added for ATS</h3>
              <div className="flex flex-wrap gap-2">
                {optimizedCVData.analysis.missing_keywords_added.map((keyword, i) => (
                  <span
                    key={i}
                    className="px-3 py-1.5 bg-gold-50 text-gold-700 rounded-full text-sm font-medium border border-gold-200"
                  >
                    + {keyword}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : changes.length > 0 ? (
        /* Fallback: legacy changes format */
        <div className="space-y-4">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="w-5 h-5 text-navy-600" />
            <h3 className="font-semibold text-charcoal text-base">
              {changes.length} strategic change{changes.length !== 1 ? 's' : ''} made
            </h3>
          </div>
          {changes.map((change, index) => (
            <Card key={index} padding="sm" className="border-l-4 border-l-navy-500">
              <div className="flex items-start gap-3">
                <div className="p-1.5 bg-navy-100 rounded">
                  <FileOutput className="w-3.5 h-3.5 text-navy-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-charcoal">{change.section}</p>
                  <p className="text-xs text-warm-gray mb-2">{change.reason}</p>
                  {change.original && (
                    <div className="space-y-2">
                      <div className="p-2 bg-red-50 rounded text-xs text-red-700 border border-red-100">
                        <span className="font-medium">Before: </span>
                        {change.original}
                      </div>
                      <div className="p-2 bg-gold-50 rounded text-xs text-gold-700 border border-gold-100">
                        <span className="font-medium">After: </span>
                        {change.updated}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center h-full text-center">
          <Sparkles className="w-12 h-12 text-cream-400 mb-4" />
          <h3 className="font-semibold text-charcoal text-base">No analysis available</h3>
          <p className="text-sm text-warm-gray mt-2 max-w-sm">
            Apply for a job from the chat to see your ATS score and optimization details here.
          </p>
        </div>
      )}
    </div>
  );
}
