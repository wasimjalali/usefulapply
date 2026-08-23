'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';

interface UseInViewOptions {
  threshold?: number;
  rootMargin?: string;
  triggerOnce?: boolean;
}

/**
 * Hook that detects when an element enters the viewport.
 * Used for scroll-triggered animations on marketing pages.
 */
export function useInView<T extends HTMLElement = HTMLDivElement>(
  options: UseInViewOptions = {}
): [RefObject<T | null>, boolean] {
  const { threshold = 0, rootMargin = '0px 0px -60px 0px', triggerOnce = true } = options;
  const ref = useRef<T | null>(null);
  const [isInView, setIsInView] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const reveal = (observer?: IntersectionObserver) => {
      setIsInView(true);
      if (triggerOnce) {
        observer?.unobserve(element);
      }
    };

    // Already on screen or scrolled past (jump-scroll, scroll restoration).
    const rect = element.getBoundingClientRect();
    if (rect.top < window.innerHeight && rect.bottom > 0) {
      reveal();
      if (triggerOnce) return;
    } else if (rect.bottom <= 0) {
      reveal();
      if (triggerOnce) return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting || entry.boundingClientRect.bottom <= 0) {
          reveal(observer);
        } else if (!triggerOnce) {
          setIsInView(false);
        }
      },
      { threshold, rootMargin }
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [threshold, rootMargin, triggerOnce]);

  return [ref, isInView];
}
