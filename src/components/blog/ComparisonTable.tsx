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
          <Check className="w-5 h-5 text-green-600" />
          {text && <span className="text-sm text-charcoal">{text}</span>}
        </div>
      );
    }
    if (status === 'no') {
      return (
        <div className="flex items-center justify-center">
          <X className="w-5 h-5 text-red-500" />
        </div>
      );
    }
    if (status === 'warning') {
      return (
        <div className="flex items-center justify-center gap-2">
          <AlertTriangle className="w-5 h-5 text-yellow-600" />
          {text && <span className="text-sm text-charcoal">{text}</span>}
        </div>
      );
    }
    return <span className="text-sm text-charcoal text-center block">{text}</span>;
  };

  const getStatusBgColor = (status: 'yes' | 'no' | 'warning' | 'text') => {
    if (status === 'yes') return 'bg-green-50/50';
    if (status === 'no') return 'bg-red-50/50';
    if (status === 'warning') return 'bg-yellow-50/50';
    return 'bg-white';
  };

  return (
    <div className="my-8 overflow-x-auto">
      <div className="inline-block min-w-full align-middle">
        <div className="overflow-hidden border border-cream-200 rounded-xl shadow-sm">
          <table className="min-w-full divide-y divide-cream-200">
            {/* Header */}
            <thead className="bg-gradient-to-r from-navy-600 to-navy-700">
              <tr>
                <th
                  scope="col"
                  className="sticky left-0 z-10 bg-navy-600 px-6 py-4 text-left text-sm font-semibold text-white border-r border-navy-500"
                >
                  Feature
                </th>
                {tools.map((tool, idx) => (
                  <th
                    key={tool.name}
                    scope="col"
                    className={`px-6 py-4 text-center text-sm font-semibold text-white whitespace-nowrap ${
                      idx === 0 ? 'bg-gold-600' : ''
                    }`}
                  >
                    {tool.name}
                  </th>
                ))}
              </tr>
            </thead>

            {/* Body */}
            <tbody className="bg-white divide-y divide-cream-200">
              {features.map((feature, featureIdx) => (
                <tr
                  key={feature.name}
                  className={featureIdx % 2 === 0 ? 'bg-cream-50/30' : 'bg-white'}
                >
                  <td className="sticky left-0 z-10 bg-white px-6 py-4 text-sm font-medium text-navy-700 border-r border-cream-200 whitespace-nowrap">
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
      <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-warm-gray">
        <div className="flex items-center gap-1.5">
          <Check className="w-4 h-4 text-green-600" />
          <span>Available</span>
        </div>
        <div className="flex items-center gap-1.5">
          <X className="w-4 h-4 text-red-500" />
          <span>Not available</span>
        </div>
        <div className="flex items-center gap-1.5">
          <AlertTriangle className="w-4 h-4 text-yellow-600" />
          <span>Partial/Manual</span>
        </div>
      </div>
    </div>
  );
}
