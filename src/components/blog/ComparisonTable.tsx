import React from 'react';
import { Check, X, AlertTriangle } from 'lucide-react';

interface ComparisonTableProps {
  tools: {
    name: string;
    color: string;
  }[];
  features: {
    name: string;
    values: {
      status: 'yes' | 'no' | 'warning' | 'text';
      text?: string;
    }[];
  }[];
}

export default function ComparisonTable({ tools, features }: ComparisonTableProps) {
  const getStatusIcon = (status: 'yes' | 'no' | 'warning' | 'text', text?: string) => {
    if (status === 'yes') {
      return (
        <div className="flex items-center justify-center gap-2">
          <Check className="w-5 h-5 text-positive" />
          {text && <span className="text-sm text-ink-body">{text}</span>}
        </div>
      );
    }
    if (status === 'no') {
      return (
        <div className="flex items-center justify-center">
          <X className="w-5 h-5 text-danger-bright" />
        </div>
      );
    }
    if (status === 'warning') {
      return (
        <div className="flex items-center justify-center gap-2">
          <AlertTriangle className="w-5 h-5 text-warning" />
          {text && <span className="text-sm text-ink-body">{text}</span>}
        </div>
      );
    }
    return <span className="text-sm text-ink-body text-center block">{text}</span>;
  };

  const getStatusBgColor = (status: 'yes' | 'no' | 'warning' | 'text') => {
    if (status === 'yes') return 'bg-positive-soft/50';
    if (status === 'no') return 'bg-danger-soft/50';
    if (status === 'warning') return 'bg-warning-soft/50';
    return 'bg-surface-raised';
  };

  return (
    <div className="my-8 overflow-x-auto">
      <div className="inline-block min-w-full align-middle">
        <div className="overflow-hidden border border-border rounded-xl shadow-resting">
          <table className="min-w-full divide-y divide-border">
            {/* Header */}
            <thead className="bg-gradient-to-r from-navy-600 to-navy-700">
              <tr>
                <th
                  scope="col"
                  className="sticky left-0 z-10 bg-brand px-6 py-4 text-left text-sm font-semibold text-brand-ink border-r border-border-inverse-mid"
                >
                  Feature
                </th>
                {tools.map((tool, idx) => (
                  <th
                    key={tool.name}
                    scope="col"
                    className={`px-6 py-4 text-center text-sm font-semibold text-brand-ink whitespace-nowrap ${
                      idx === 0 ? 'bg-accent-deep' : ''
                    }`}
                  >
                    {tool.name}
                  </th>
                ))}
              </tr>
            </thead>

            {/* Body */}
            <tbody className="bg-surface-raised divide-y divide-border">
              {features.map((feature, featureIdx) => (
                <tr
                  key={feature.name}
                  className={featureIdx % 2 === 0 ? 'bg-surface/30' : 'bg-surface-raised'}
                >
                  <td className="sticky left-0 z-10 bg-surface-raised px-6 py-4 text-sm font-medium text-brand-strong border-r border-border whitespace-nowrap">
                    {feature.name}
                  </td>
                  {feature.values.map((value, valueIdx) => (
                    <td
                      key={`${feature.name}-${valueIdx}`}
                      className={`px-6 py-4 text-sm ${getStatusBgColor(value.status)}`}
                    >
                      {getStatusIcon(value.status, value.text)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Legend */}
      <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-ink-muted">
        <div className="flex items-center gap-1.5">
          <Check className="w-4 h-4 text-positive" />
          <span>Available</span>
        </div>
        <div className="flex items-center gap-1.5">
          <X className="w-4 h-4 text-danger-bright" />
          <span>Not available</span>
        </div>
        <div className="flex items-center gap-1.5">
          <AlertTriangle className="w-4 h-4 text-warning" />
          <span>Partial/Manual</span>
        </div>
      </div>
    </div>
  );
}
