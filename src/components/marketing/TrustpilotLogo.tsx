/** Trustpilot star mark — brand green #00B67A */
function TrustpilotStar({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <path d="M12 1.5l2.91 6.84 7.42.74-5.6 4.86 1.68 7.26L12 17.77l-6.41 3.43 1.68-7.26-5.6-4.86 7.42-.74L12 1.5z" />
    </svg>
  );
}

/**
 * Compact Trustpilot star mark for dark surfaces (footer).
 * Static only: there is no verified usefulapply.com Trustpilot listing.
 */
export default function TrustpilotLogo() {
  return (
    <div
      aria-hidden
      className="inline-flex items-center gap-2 h-9 px-3.5 rounded-lg bg-cream-50 text-navy-900 shadow-sm"
    >
      <span className="flex items-center justify-center w-5 h-5 rounded-[3px] bg-[#00B67A] text-white shrink-0">
        <TrustpilotStar className="w-3 h-3" />
      </span>
      <span className="text-sm font-semibold tracking-tight leading-none">
        Trustpilot
      </span>
      <span className="flex items-center gap-0.5 text-[#00B67A]">
        {Array.from({ length: 5 }).map((_, i) => (
          <TrustpilotStar key={i} className="w-3 h-3" />
        ))}
      </span>
    </div>
  );
}
