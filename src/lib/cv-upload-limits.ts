export const AUTHENTICATED_CV_UPLOAD_LIMIT_BYTES = 10 * 1024 * 1024;
export const ANONYMOUS_CV_UPLOAD_LIMIT_BYTES = 4.5 * 1024 * 1024;

export function getPrimaryCVUploadLimitBytes(isAuthenticated: boolean): number {
  return isAuthenticated ? AUTHENTICATED_CV_UPLOAD_LIMIT_BYTES : ANONYMOUS_CV_UPLOAD_LIMIT_BYTES;
}

export function formatUploadLimit(bytes: number): string {
  const mb = bytes / 1024 / 1024;
  return Number.isInteger(mb) ? `${mb} MB` : `${mb.toFixed(1)} MB`;
}

export function getCVUploadDescription(maxSizeBytes: number): string {
  return `PDF, DOCX, TXT, MD, or TEX (max ${formatUploadLimit(maxSizeBytes)})`;
}
