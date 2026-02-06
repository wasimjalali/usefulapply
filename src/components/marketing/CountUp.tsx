'use client';

import { useEffect, useState } from 'react';
import { useInView } from '@/hooks/useInView';

interface CountUpProps {
  value: string;
  className?: string;
  duration?: number;
}

/**
 * Animated counter that counts up when scrolled into view.
 * Handles numeric values with prefixes/suffixes like "45+", "<3", "100%", "3-in-1".
 */
export function CountUp({ value, className = '', duration = 1500 }: CountUpProps) {
  const [ref, isInView] = useInView({ threshold: 0.3 });
  const [displayValue, setDisplayValue] = useState(value);

  useEffect(() => {
    if (!isInView) return;

    // Extract numeric part and prefix/suffix
    const match = value.match(/^([<>~$]*)(\d+(?:\.\d+)?)(.*)/);
    if (!match) {
      setDisplayValue(value);
      return;
    }

    const prefix = match[1];
    const target = parseFloat(match[2]);
    const suffix = match[3];
    const isDecimal = match[2].includes('.');
    const steps = 40;
    const stepDuration = duration / steps;
    let current = 0;

    const timer = setInterval(() => {
      current++;
      const progress = current / steps;
      // Ease-out curve
      const eased = 1 - Math.pow(1 - progress, 3);
      const currentValue = eased * target;

      if (current >= steps) {
        setDisplayValue(`${prefix}${isDecimal ? target.toFixed(2) : target}${suffix}`);
        clearInterval(timer);
      } else {
        setDisplayValue(`${prefix}${isDecimal ? currentValue.toFixed(2) : Math.round(currentValue)}${suffix}`);
      }
    }, stepDuration);

    return () => clearInterval(timer);
  }, [isInView, value, duration]);

  return (
    <span ref={ref} className={className}>
      {displayValue}
    </span>
  );
}
