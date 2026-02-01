'use client';

import { useState } from 'react';
import { 
  Settings2, 
  Globe, 
  RefreshCw, 
  Sparkles,
  ChevronDown,
  ChevronUp,
  Info,
} from 'lucide-react';

interface AgentSettingsToggleProps {
  enableWebSearch: boolean;
  enableReflection: boolean;
  onWebSearchChange: (enabled: boolean) => void;
  onReflectionChange: (enabled: boolean) => void;
  compact?: boolean;
}

export function AgentSettingsToggle({
  enableWebSearch,
  enableReflection,
  onWebSearchChange,
  onReflectionChange,
  compact = false,
}: AgentSettingsToggleProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <button
          onClick={() => onWebSearchChange(!enableWebSearch)}
          className={`p-1.5 rounded-md transition-colors ${
            enableWebSearch 
              ? 'bg-blue-100 text-blue-600' 
              : 'bg-cream-100 text-warm-gray hover:bg-cream-200'
          }`}
          title={enableWebSearch ? 'Company research enabled' : 'Company research disabled'}
        >
          <Globe className="w-4 h-4" />
        </button>
        <button
          onClick={() => onReflectionChange(!enableReflection)}
          className={`p-1.5 rounded-md transition-colors ${
            enableReflection 
              ? 'bg-purple-100 text-purple-600' 
              : 'bg-cream-100 text-warm-gray hover:bg-cream-200'
          }`}
          title={enableReflection ? 'Quality refinement enabled' : 'Quality refinement disabled'}
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-cream-200 overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-cream-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Settings2 className="w-4 h-4 text-warm-gray" />
          <span className="text-sm font-medium text-charcoal">AI Settings</span>
          <Sparkles className="w-3.5 h-3.5 text-gold" />
        </div>
        {isExpanded ? (
          <ChevronUp className="w-4 h-4 text-warm-gray" />
        ) : (
          <ChevronDown className="w-4 h-4 text-warm-gray" />
        )}
      </button>

      {/* Settings panel */}
      {isExpanded && (
        <div className="px-4 pb-4 space-y-4 border-t border-cream-100">
          {/* Web Search Toggle */}
          <div className="pt-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${enableWebSearch ? 'bg-blue-100' : 'bg-cream-100'}`}>
                  <Globe className={`w-4 h-4 ${enableWebSearch ? 'text-blue-600' : 'text-warm-gray'}`} />
                </div>
                <div>
                  <p className="text-sm font-medium text-charcoal">Company Research</p>
                  <p className="text-xs text-warm-gray">Search web for company info</p>
                </div>
              </div>
              <button
                onClick={() => onWebSearchChange(!enableWebSearch)}
                aria-label={enableWebSearch ? 'Disable company research' : 'Enable company research'}
                className={`relative w-11 h-6 rounded-full transition-colors ${
                  enableWebSearch ? 'bg-blue-500' : 'bg-cream-300'
                }`}
              >
                <div
                  className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                    enableWebSearch ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
            {enableWebSearch && (
              <div className="mt-2 ml-11 flex items-start gap-1.5 text-xs text-blue-600 bg-blue-50 p-2 rounded">
                <Info className="w-3 h-3 mt-0.5 flex-shrink-0" />
                <span>Uses Tavily to research company culture, values, and recent news</span>
              </div>
            )}
          </div>

          {/* Reflection Toggle */}
          <div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${enableReflection ? 'bg-purple-100' : 'bg-cream-100'}`}>
                  <RefreshCw className={`w-4 h-4 ${enableReflection ? 'text-purple-600' : 'text-warm-gray'}`} />
                </div>
                <div>
                  <p className="text-sm font-medium text-charcoal">Quality Refinement</p>
                  <p className="text-xs text-warm-gray">Auto-improve content quality</p>
                </div>
              </div>
              <button
                onClick={() => onReflectionChange(!enableReflection)}
                aria-label={enableReflection ? 'Disable quality refinement' : 'Enable quality refinement'}
                className={`relative w-11 h-6 rounded-full transition-colors ${
                  enableReflection ? 'bg-purple-500' : 'bg-cream-300'
                }`}
              >
                <div
                  className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                    enableReflection ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
            {enableReflection && (
              <div className="mt-2 ml-11 flex items-start gap-1.5 text-xs text-purple-600 bg-purple-50 p-2 rounded">
                <Info className="w-3 h-3 mt-0.5 flex-shrink-0" />
                <span>Evaluates and refines content up to 3 times for optimal quality</span>
              </div>
            )}
          </div>

          {/* Model info */}
          <div className="pt-2 border-t border-cream-100">
            <p className="text-xs text-warm-gray mb-2">Powered by</p>
            <div className="flex flex-wrap gap-2">
              <span className="px-2 py-1 bg-green-50 text-green-700 text-xs rounded-full">
                GPT-4o mini (All Tasks)
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
