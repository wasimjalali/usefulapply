import { HTMLAttributes, forwardRef } from 'react';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ className = '', padding = 'md', children, ...props }, ref) => {
    const paddings = {
      none: '',
      sm: 'p-3',
      md: 'p-4',
      lg: 'p-6',
    };

    // A caller's own background replaces the default. Two bg utilities on one element resolve by Tailwind's
    // class order, not by which came last in the string, so the default is left out instead of overridden.
    const background = /(^|\s)bg-/.test(className) ? '' : 'bg-surface ';

    return (
      <div
        ref={ref}
        className={`${background}rounded-card border border-border shadow-resting ${paddings[padding]} ${className}`}
        {...props}
      >
        {children}
      </div>
    );
  }
);

Card.displayName = 'Card';
