'use client';

import Image from 'next/image';

export default function TrustpilotLogo() {
  return (
    <Image
      src="/trustpilot-logo.png"
      alt="Read and leave reviews on Trustpilot"
      width={140}
      height={36}
      className="w-36 h-auto cursor-pointer hover:opacity-80 transition-opacity block"
      onClick={() => window.open('https://www.trustpilot.com/review/karkoai.com', '_blank', 'noopener,noreferrer')}
      role="button"
      tabIndex={0}
      onKeyPress={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          window.open('https://www.trustpilot.com/review/karkoai.com', '_blank', 'noopener,noreferrer');
        }
      }}
    />
  );
}
