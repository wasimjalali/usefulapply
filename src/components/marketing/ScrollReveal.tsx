'use client';

import { useInView } from '@/hooks/useInView';
import { type ReactNode } from 'react';

interface ScrollRevealProps {
  children: ReactNode;
  className?: string;
  delay?: number;
  direction?: 'up' | 'down' | 'left' | 'right' | 'none';
  duration?: number;
  distance?: number;
}

/**
 * Wrapper component that reveals its children with a smooth animation
 * when they scroll into the viewport. Zero JS animation overhead —
 * uses CSS transitions triggered by a class toggle.
 */
export function ScrollReveal({
  children,
  className = '',
  delay = 0,
  direction = 'up',
  duration = 600,
  distance = 30,
}: ScrollRevealProps) {
  const [ref, isInView] = useInView({ threshold: 0 });

  const getTransform = () => {
    if (direction === 'none') return 'none';
    const map = {
      up: `translateY(${distance}px)`,
      down: `translateY(-${distance}px)`,
      left: `translateX(${distance}px)`,
      right: `translateX(-${distance}px)`,
    };
    return map[direction];
  };

  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: isInView ? 1 : 0,
        transform: isInView ? 'none' : getTransform(),
        transition: `opacity ${duration}ms ease-out ${delay}ms, transform ${duration}ms ease-out ${delay}ms`,
        willChange: 'opacity, transform',
      }}
    >
      {children}
    </div>
  );
}

interface StaggerChildrenProps {
  children: ReactNode;
  className?: string;
  staggerDelay?: number;
  direction?: 'up' | 'down' | 'left' | 'right' | 'none';
  duration?: number;
}

/**
 * Wrapper that staggers the reveal of its direct children.
 * Each child gets an increasing delay for a cascade effect.
 */
export function StaggerChildren({
  children,
  className = '',
  staggerDelay = 100,
  direction = 'up',
  duration = 500,
}: StaggerChildrenProps) {
  const [ref, isInView] = useInView({ threshold: 0 });

  const getTransform = () => {
    if (direction === 'none') return 'none';
    const map = {
      up: 'translateY(24px)',
      down: 'translateY(-24px)',
      left: 'translateX(24px)',
      right: 'translateX(-24px)',
    };
    return map[direction];
  };

  return (
    <div ref={ref} className={className}>
      {Array.isArray(children)
        ? children.map((child, i) => (
            <div
              key={i}
              style={{
                opacity: isInView ? 1 : 0,
                transform: isInView ? 'none' : getTransform(),
                transition: `opacity ${duration}ms ease-out ${i * staggerDelay}ms, transform ${duration}ms ease-out ${i * staggerDelay}ms`,
                willChange: 'opacity, transform',
              }}
            >
              {child}
            </div>
          ))
        : children}
    </div>
  );
}
