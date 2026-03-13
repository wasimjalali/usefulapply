/**
 * Cross-browser PDF/blob download utility.
 *
 * Mobile browsers (especially iOS Safari) do not support the `download`
 * attribute on <a> tags, so the standard createObjectURL + a.click() pattern
 * silently fails. This utility uses the Web Share API on mobile (native OS
 * share sheet — "Save to Files", AirDrop, etc.) and falls back to the
 * standard <a download> pattern on desktop.
 */

function getIsIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    // iPad on iOS 13+ reports as Mac
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

function getIsMobileOrTablet(): boolean {
  if (typeof navigator === 'undefined') return false;
  return (
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent
    ) ||
    // iPad on iOS 13+ (desktop-class Safari)
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

/** Map file extension to MIME type */
function getMimeType(filename: string): string {
  if (filename.endsWith('.pdf')) return 'application/pdf';
  if (filename.endsWith('.docx'))
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  return 'application/octet-stream';
}

/**
 * Try the Web Share API (native mobile share sheet).
 * Returns true if sharing succeeded, false if unavailable or failed.
 */
async function tryNativeShare(blob: Blob, filename: string): Promise<boolean> {
  try {
    if (!navigator.share || !navigator.canShare) return false;
    const file = new File([blob], filename, { type: getMimeType(filename) });
    if (!navigator.canShare({ files: [file] })) return false;
    await navigator.share({ files: [file], title: filename });
    return true;
  } catch (err: unknown) {
    // User cancelled the share sheet — not an error
    if (err instanceof Error && err.name === 'AbortError') return true;
    return false;
  }
}

/**
 * Download a blob as a file, with mobile-safe fallback.
 * Uses navigator.share() on mobile, <a download> on desktop.
 *
 * @param blob - The file blob (PDF, DOCX, etc.)
 * @param filename - Suggested download filename
 */
export async function downloadBlob(blob: Blob, filename: string): Promise<void> {
  // On mobile, try the native share sheet first (works on iOS Safari 15+, Android Chrome)
  if (getIsMobileOrTablet()) {
    const shared = await tryNativeShare(blob, filename);
    if (shared) return;

    // Fallback for older mobile browsers: open blob in current tab.
    // For PDFs this shows the built-in PDF viewer; for DOCX the browser
    // will prompt a download. We use an iframe to avoid losing app state.
    const url = URL.createObjectURL(blob);
    if (getIsIOS()) {
      // iOS: open in a hidden iframe — triggers the native "Open in..." prompt for PDFs
      const iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      iframe.src = url;
      document.body.appendChild(iframe);
      setTimeout(() => {
        document.body.removeChild(iframe);
        URL.revokeObjectURL(url);
      }, 60_000);
    } else {
      // Android fallback: standard <a> click (works on most Android browsers)
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
    return;
  }

  // Desktop: standard blob download via <a download>
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Returns the recommended html2canvas capture scale for the current device.
 * Mobile devices have less RAM, so we use a lower scale to prevent crashes.
 */
export function getCaptureScale(): number {
  return getIsMobileOrTablet() ? 2 : 3;
}

export { getIsIOS, getIsMobileOrTablet };
