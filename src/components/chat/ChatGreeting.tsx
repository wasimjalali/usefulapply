'use client';

// Adaptive greeting for chat empty states. Time-of-day comes from the
// browser clock, the name from the authenticated user. The component
// renders nothing until mounted so SSR and client never disagree.

import { useEffect, useState } from 'react';

export function greetingLine(name?: string | null, date: Date = new Date()): string {
  const hour = date.getHours();
  const part = hour >= 5 && hour < 12
    ? 'Good morning'
    : hour >= 12 && hour < 17
      ? 'Good afternoon'
      : 'Good evening';
  const first = name?.trim().split(/\s+/)[0];
  return first ? `${part}, ${first}.` : `${part}.`;
}

/** Prefix a conversation opener with the greeting, e.g. tracker and feed openers. */
export function withGreeting(text: string, name?: string | null): string {
  return `${greetingLine(name)} ${text}`;
}

export default function ChatGreeting({ name }: { name?: string | null }) {
  const [line, setLine] = useState<string | null>(null);
  useEffect(() => {
    setLine(greetingLine(name));
  }, [name]);
  if (!line) return null;
  return (
    <div className="flex flex-col items-center gap-1 text-center">
      <p className="text-[22px] font-semibold text-navy-800">{line}</p>
      <p className="text-sm text-warm-gray">What should we work on?</p>
    </div>
  );
}
