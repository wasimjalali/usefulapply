'use client';

import React from 'react';
import Image from 'next/image';

/**
 * Hero section background using the ethereal clouds + gold light streams image.
 * Full-bleed background with subtle overlay for text readability.
 */
export function HeroBackground() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {/* Main background image */}
      <Image
        src="/hero-clouds-bg.jpg"
        alt=""
        fill
        priority
        quality={90}
        className="object-cover object-center"
        sizes="100vw"
      />
      {/* Subtle gradient overlay for better text contrast at top */}
      <div className="absolute inset-0 bg-gradient-to-b from-cream-100/30 via-transparent to-cream-100/50" />
    </div>
  );
}

export default HeroBackground;
