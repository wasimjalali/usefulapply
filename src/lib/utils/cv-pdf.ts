/**
 * CV PDF export. Captures a rendered CV template element with html2canvas and
 * slices it into pages with jsPDF. Shared by the CV tab's Download PDF and the
 * kit-wide Download all, which renders the template offscreen.
 */

import { getCaptureScale, getIsMobileOrTablet } from '@/lib/utils/download-pdf';

// White margin added at the top and bottom of every PDF page (~10mm).
// Content per page = pageHeight - 2×gutter; both the PDF slicer and the
// preview indicator must use the same value so the line matches the cut.
export const CV_PAGE_GUTTER_PX = 40;

/**
 * Implements CSS `object-fit: cover` logic on a canvas: center-crops the source
 * image to fill the target dimensions, then returns a small JPEG data URL.
 * This replaces the html2canvas background-image workaround that caused blurry
 * photos and layout shifts.
 */
function cropImageCover(
  src: string,
  targetW: number,
  targetH: number,
  quality = 0.92,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const srcRatio = img.naturalWidth / img.naturalHeight;
      const tgtRatio = targetW / targetH;

      let sx: number, sy: number, sw: number, sh: number;
      if (srcRatio > tgtRatio) {
        // Source is wider — crop horizontally
        sh = img.naturalHeight;
        sw = sh * tgtRatio;
        sx = (img.naturalWidth - sw) / 2;
        sy = 0;
      } else {
        // Source is taller — crop vertically
        sw = img.naturalWidth;
        sh = sw / tgtRatio;
        sx = 0;
        sy = (img.naturalHeight - sh) / 2;
      }

      const canvas = document.createElement('canvas');
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return reject(new Error('Could not get 2d context'));
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, targetW, targetH);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => reject(new Error('Image load failed'));
    img.src = src;
  });
}

/**
 * Scans the captured canvas for the row with the fewest non-white pixels
 * near `targetY`, within ±`searchRange` pixels. Returns the optimal Y
 * coordinate for slicing to avoid cutting through text.
 */
function findBestBreakY(
  canvas: HTMLCanvasElement,
  targetY: number,
  searchRange: number,
): number {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return targetY;

  const startY = Math.max(0, targetY - searchRange);
  const endY = Math.min(canvas.height - 1, targetY);
  if (startY >= endY) return targetY;

  const width = canvas.width;
  let bestY = targetY;
  let bestScore = Infinity;

  for (let y = startY; y <= endY; y++) {
    const row = ctx.getImageData(0, y, width, 1).data;
    let darkPixels = 0;
    for (let x = 0; x < width; x++) {
      const idx = x * 4;
      // A pixel is "dark" (non-white) if any channel is below 240
      if (row[idx] < 240 || row[idx + 1] < 240 || row[idx + 2] < 240) {
        darkPixels++;
      }
    }
    if (darkPixels < bestScore) {
      bestScore = darkPixels;
      bestY = y;
    }
  }
  return bestY;
}

export interface CvPdfOptions {
  templateId: string;
  photoUrl?: string;
  onStep?: (step: string) => void;
}

/** Render `el` (a mounted CVTemplateRenderer wrapper) to a paged PDF blob. */
export async function generateCvPdfBlob(el: HTMLElement, opts: CvPdfOptions): Promise<Blob> {
  // Step tracking for mobile diagnostics: the step name is shown in the
  // error toast so the user can report exactly where the failure occurs.
  const step = opts.onStep ?? (() => {});
  step('import');
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import('html2canvas'),
    import('jspdf'),
  ]);

  const isGerman = opts.templateId.startsWith('german');
  const pageWidthMm = isGerman ? 210 : 215.9;
  const pageHeightMm = isGerman ? 297 : 279.4;
  // Page height in natural pixels at 96 dpi
  const pageHeightNaturalPx = isGerman ? Math.round((297 / 25.4) * 96) : 1056;
  const isMobile = getIsMobileOrTablet();

  step('css-clean');
  // --- Determine capture scale ---
  // Start with device-appropriate scale, then cap to stay within iOS Safari's
  // maximum canvas area (~16M pixels). Exceeding this silently produces a blank
  // canvas with no error thrown.
  const MAX_CANVAS_AREA = 16_000_000;
  const naturalW = el.scrollWidth;
  const naturalH = el.scrollHeight;
  let captureScale = getCaptureScale();
  while (
    naturalW * captureScale * naturalH * captureScale > MAX_CANVAS_AREA &&
    captureScale > 1
  ) {
    captureScale -= 0.5;
  }
  // Debug: log dimensions for mobile diagnostics (visible in console)
  console.log(`[PDF] mobile=${isMobile} el=${naturalW}x${naturalH} scale=${captureScale} canvas=${naturalW * captureScale}x${naturalH * captureScale} area=${(naturalW * captureScale * naturalH * captureScale / 1e6).toFixed(1)}M`);

  // html2canvas 1.4.1 can't parse CSS Color Level 4 functions (oklch, lab, etc.)
  // used by Tailwind v4. Pre-fetch all stylesheets, replace unsupported color values,
  // then inject the cleaned CSS in onclone (which is synchronous — can't fetch inside it).
  const unsupportedColorRe = /\b(?:oklch|oklab|lab|lch)\s*\([^)]*\)/g;
  const cssMap = new Map<string, string>();

  // Try CSSOM first (synchronous, no network) — works for same-origin sheets.
  // Falls back to fetch for any sheets where CSSOM access throws SecurityError.
  const fetchFallbackLinks: HTMLLinkElement[] = [];
  const linkEls = Array.from(
    document.head.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')
  );

  for (const link of linkEls) {
    try {
      const sheet = Array.from(document.styleSheets).find(
        (s) => s.href === link.href
      );
      if (sheet && sheet.cssRules) {
        const rules = Array.from(sheet.cssRules)
          .map((r) => r.cssText)
          .join('\n');
        cssMap.set(link.href, rules.replace(unsupportedColorRe, 'inherit'));
      } else {
        fetchFallbackLinks.push(link);
      }
    } catch {
      // SecurityError for cross-origin sheets — fall back to fetch on desktop
      if (!isMobile) fetchFallbackLinks.push(link);
    }
  }

  // Fetch any sheets that CSSOM couldn't read (desktop only — mobile skips
  // network fetches to avoid timeout/CORS failures on slow connections)
  if (fetchFallbackLinks.length > 0 && !isMobile) {
    await Promise.allSettled(
      fetchFallbackLinks.map(async (link) => {
        try {
          const res = await fetch(link.href);
          const css = await res.text();
          cssMap.set(link.href, css.replace(unsupportedColorRe, 'inherit'));
        } catch { /* leave out of map — link will be replaced with empty style */ }
      })
    );
  }

  // Pre-fetch photo as base64 and pre-crop it to exactly match the container
  // dimensions × captureScale. Skip on mobile to save memory — the photo will
  // still render (just via html2canvas's native handling).
  let croppedPhotoDataUrl: string | null = null;
  const photoSrc = opts.photoUrl;
  if (photoSrc && !isMobile) {
    try {
      let photoBase64 = photoSrc;
      if (!photoSrc.startsWith('data:')) {
        const resp = await fetch(photoSrc);
        const blob = await resp.blob();
        photoBase64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      }
      let liveImg: HTMLImageElement | null = null;
      for (const img of Array.from(el.querySelectorAll<HTMLImageElement>('img'))) {
        if (img.style.objectFit === 'cover' || img.style.objectFit === 'contain') {
          liveImg = img;
          break;
        }
      }
      if (liveImg && liveImg.parentElement) {
        const containerW = liveImg.parentElement.offsetWidth;
        const containerH = liveImg.parentElement.offsetHeight;
        if (containerW > 0 && containerH > 0) {
          croppedPhotoDataUrl = await cropImageCover(
            photoBase64,
            containerW * captureScale,
            containerH * captureScale,
          );
        }
      }
      if (!croppedPhotoDataUrl) {
        croppedPhotoDataUrl = photoBase64;
      }
    } catch {
      console.warn('Could not pre-fetch/crop profile photo for PDF');
    }
  }

  // Collect link positions before html2canvas capture (links become pixels in the raster).
  // Skip on mobile to save memory — clickable links are a desktop-only enhancement.
  const elRect = el.getBoundingClientRect();
  const linkAnnotations: { x: number; y: number; w: number; h: number; url: string }[] = [];
  if (!isMobile) {
    el.querySelectorAll<HTMLAnchorElement>('a[href]').forEach((a) => {
      const href = a.getAttribute('href');
      if (!href || href.startsWith('#') || href.startsWith('javascript:')) return;
      const r = a.getBoundingClientRect();
      linkAnnotations.push({
        x: r.left - elRect.left,
        y: r.top - elRect.top,
        w: r.width,
        h: r.height,
        url: href.startsWith('mailto:') ? href : (href.startsWith('http') ? href : `https://${href}`),
      });
    });
  }

  // --- html2canvas capture ---
  step('capture');

  let canvas: HTMLCanvasElement;

  if (isMobile) {
    // On mobile, the CV template is deep inside a constrained layout with
    // overflow:hidden, CSS transforms, and viewport-width parents. html2canvas
    // can't properly capture elements in this state on mobile browsers (returns
    // 0x0 canvas). Neither onclone fixes nor real DOM expansion work reliably.
    //
    // Solution (per expert recommendation): clone the CV element into a fresh
    // offscreen container that's outside ALL layout constraints, visible to the
    // browser rendering engine (position:absolute, 1px clip), give the browser
    // time to complete layout (200ms), then capture from the unconstrained clone.
    const offscreen = document.createElement('div');
    offscreen.style.cssText = `
      position: fixed;
      left: -9999px;
      top: 0;
      width: ${naturalW}px;
      pointer-events: none;
      z-index: -9999;
      opacity: 1;
    `;
    // Deep-clone the CV element into the offscreen container
    const captureEl = el.cloneNode(true) as HTMLElement;
    captureEl.style.cssText = `
      display: block;
      width: ${naturalW}px;
      min-height: ${naturalH}px;
      position: static;
      transform: none;
      box-shadow: none;
    `;
    offscreen.appendChild(captureEl);
    document.body.appendChild(offscreen);

    // Give the browser time to fully layout and paint the cloned element.
    // Mobile browsers need this — requestAnimationFrame alone is not enough.
    await new Promise<void>((resolve) => setTimeout(resolve, 200));
    // Force layout computation
    void captureEl.offsetWidth;

    const computed = getComputedStyle(captureEl);
    console.log(`[PDF] offscreen clone: offset=${captureEl.offsetWidth}x${captureEl.offsetHeight} display=${computed.display} visibility=${computed.visibility}`);

    try {
      canvas = await html2canvas(captureEl, {
        scale: captureScale,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
        windowWidth: naturalW,
        windowHeight: naturalH,
        imageTimeout: 5000,
        allowTaint: true,
        onclone: (_doc: Document, clonedEl: HTMLElement) => {
          clonedEl.style.boxShadow = 'none';
          clonedEl.style.opacity = '1';
          // Ensure full opacity on all ancestors in html2canvas's internal clone
          let anc: HTMLElement | null = clonedEl.parentElement;
          while (anc && anc !== _doc.body) {
            anc.style.opacity = '1';
            anc.style.position = 'static';
            anc = anc.parentElement;
          }
          // Replace stylesheets with cleaned versions (oklch/oklab removal)
          if (cssMap.size > 0) {
            _doc.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]').forEach((link) => {
              const style = _doc.createElement('style');
              style.textContent = cssMap.get(link.href) ?? '';
              link.parentNode?.replaceChild(style, link);
            });
          }
          _doc.querySelectorAll('style').forEach((style) => {
            if (style.textContent) {
              style.textContent = style.textContent.replace(unsupportedColorRe, 'inherit');
            }
          });
          clonedEl.querySelectorAll('svg').forEach((svg) => {
            svg.style.position = 'relative';
            svg.style.top = '1px';
          });
        },
      });
    } finally {
      document.body.removeChild(offscreen);
    }
  } else {
    // Desktop: capture directly from the real element (works perfectly)
    canvas = await html2canvas(el, {
      scale: captureScale,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
      windowWidth: naturalW,
        windowHeight: naturalH,
      onclone: (_doc: Document, clonedEl: HTMLElement) => {
        clonedEl.style.boxShadow = 'none';
        if (clonedEl.parentElement) {
          clonedEl.parentElement.style.transform = 'none';
          clonedEl.parentElement.style.boxShadow = 'none';
        }
        if (cssMap.size > 0) {
          _doc.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]').forEach((link) => {
            const style = _doc.createElement('style');
            style.textContent = cssMap.get(link.href) ?? '';
            link.parentNode?.replaceChild(style, link);
          });
        }
        _doc.querySelectorAll('style').forEach((style) => {
          if (style.textContent) {
            style.textContent = style.textContent.replace(unsupportedColorRe, 'inherit');
          }
        });
        clonedEl.querySelectorAll('svg').forEach((svg) => {
          svg.style.position = 'relative';
          svg.style.top = '1px';
        });
        if (croppedPhotoDataUrl) {
          clonedEl.querySelectorAll<HTMLImageElement>('img').forEach((img) => {
            if (!img.src || !img.parentElement) return;
            if (img.style.objectFit === 'cover' || img.style.objectFit === 'contain') {
              const parentW = img.parentElement.offsetWidth;
              const parentH = img.parentElement.offsetHeight;
              img.src = croppedPhotoDataUrl!;
              img.style.objectFit = '';
              img.style.width = parentW + 'px';
              img.style.height = parentH + 'px';
            }
          });
        }
      },
    });
  }

  step('pdf-build');

  // Validate the capture canvas — on mobile Safari, html2canvas can return
  // a canvas with 0x0 dimensions when the output exceeds internal limits.
  // A canvas shorter than the element means html2canvas clipped it (an
  // offscreen host on a short viewport, for instance); that would ship a
  // truncated PDF as a success.
  if (canvas.width && canvas.height && canvas.height < naturalH * captureScale * 0.98) {
    throw new Error(`Canvas clipped: ${canvas.height}px of ${Math.round(naturalH * captureScale)}px`);
  }
  if (!canvas.width || !canvas.height) {
    // Include element dimensions in error so we can diagnose remotely
    const rect = el.getBoundingClientRect();
    throw new Error(
      `Canvas 0x0. el:${naturalW}x${naturalH} rect:${Math.round(rect.width)}x${Math.round(rect.height)} off:${el.offsetWidth}x${el.offsetHeight} scale:${captureScale}`
    );
  }
  console.log(`[PDF] capture OK: ${canvas.width}x${canvas.height}`);

  const doc = new jsPDF({
    format: isGerman ? 'a4' : 'letter',
    unit: 'mm',
    orientation: 'portrait',
  });

  // --- Page slicing ---
  const pageCanvasH = pageHeightNaturalPx * captureScale;
  const contentCanvasH = (pageHeightNaturalPx - 2 * CV_PAGE_GUTTER_PX) * captureScale;
  const gutterCanvasH = CV_PAGE_GUTTER_PX * captureScale;

  // Compute smart break points: scan for whitespace rows near each nominal
  // break to avoid slicing through text. Search range = 80px natural ≈ 4-5 lines.
  const breakSearchRange = 80 * captureScale;
  const breakPoints: number[] = [0];
  let cursor = 0;
  while (cursor + contentCanvasH < canvas.height) {
    const nominalBreak = cursor + contentCanvasH;
    const bestBreak = findBestBreakY(canvas, nominalBreak, breakSearchRange);
    breakPoints.push(bestBreak);
    cursor = bestBreak;
  }
  const totalPages = breakPoints.length;

  // On mobile, use slightly lower JPEG quality to reduce memory during encoding.
  const imgQuality = isMobile ? 0.85 : 0.95;

  for (let page = 0; page < totalPages; page++) {
    if (page > 0) doc.addPage();
    const srcY = breakPoints[page];
    const srcEnd = page + 1 < totalPages ? breakPoints[page + 1] : canvas.height;
    const srcH = Math.min(srcEnd - srcY, contentCanvasH);
    const topGutterCanvasH = page === 0 ? 0 : gutterCanvasH;
    const pageCanvas = document.createElement('canvas');
    pageCanvas.width = canvas.width;
    pageCanvas.height = pageCanvasH;
    const ctx = pageCanvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
      ctx.drawImage(canvas, 0, srcY, canvas.width, srcH, 0, topGutterCanvasH, canvas.width, srcH);
    }

    // Use toDataURL on all platforms — toBlob() throws InvalidStateError on
    // mobile Safari even when the canvas is valid. toDataURL is synchronous
    // and more reliably supported across mobile browsers.
    doc.addImage(
      pageCanvas.toDataURL('image/jpeg', imgQuality),
      'JPEG', 0, 0, pageWidthMm, pageHeightMm,
      undefined, // alias
      'FAST',    // compression — skip jsPDF's internal re-compression
    );

    // Force immediate canvas memory deallocation (WebKit bug #195325)
    pageCanvas.width = 0;
    pageCanvas.height = 0;
  }

  // Release the main capture canvas memory
  canvas.width = 0;
  canvas.height = 0;

  // Add clickable link annotations (desktop only — linkAnnotations is empty on mobile).
  if (linkAnnotations.length > 0) {
    const pxToMmX = pageWidthMm / naturalW;
    const pxToMmY = pageHeightMm / pageHeightNaturalPx;
    const gutterNaturalPx = CV_PAGE_GUTTER_PX;

    for (const link of linkAnnotations) {
      const linkCenterY = link.y + link.h / 2;
      let pageIdx = 0;
      for (let i = 1; i < breakPoints.length; i++) {
        if (linkCenterY * captureScale >= breakPoints[i]) {
          pageIdx = i;
        }
      }
      const pageSrcY = breakPoints[pageIdx] / captureScale;
      const yOnContent = link.y - pageSrcY;
      const topGutterNaturalPx = pageIdx === 0 ? 0 : gutterNaturalPx;
      const yOnPage = topGutterNaturalPx + yOnContent;

      const xMm = link.x * pxToMmX;
      const yMm = yOnPage * pxToMmY;
      const wMm = link.w * pxToMmX;
      const hMm = link.h * pxToMmY;

      if (yMm >= 0 && yMm < pageHeightMm) {
        doc.setPage(pageIdx + 1);
        doc.link(xMm, yMm, wMm, hMm, { url: link.url });
      }
    }
  }

  step('download');
  return doc.output('blob');
}
