'use client';

import { useEffect } from 'react';

/**
 * Stamps `data-scrolling` on whatever element is scrolling and removes it
 * 700ms after the last scroll event. globals.css reveals that element's
 * scrollbar while the attribute is present, which gives the overlay bar
 * its "appears while you scroll" half; the :hover rules give it the other.
 * Renders nothing; mounted once in the root layout.
 */
export function ScrollbarReveal() {
  useEffect(() => {
    const timers = new Map<Element, number>();

    const onScroll = (event: Event) => {
      const target =
        event.target === document ? document.documentElement : event.target;
      if (!(target instanceof Element)) return;
      target.setAttribute('data-scrolling', '');
      const prev = timers.get(target);
      if (prev !== undefined) window.clearTimeout(prev);
      timers.set(
        target,
        window.setTimeout(() => {
          target.removeAttribute('data-scrolling');
          timers.delete(target);
        }, 700),
      );
    };

    window.addEventListener('scroll', onScroll, { capture: true, passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll, { capture: true });
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, []);

  return null;
}

export default ScrollbarReveal;
