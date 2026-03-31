'use client';

import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { useAppStore } from '@/store/useAppStore';
import { useCVStore } from '@/store/useCVStore';
import { useSessionStore } from '@/store/useSessionStore';
import { CVTemplateRenderer, CV_TEMPLATE_DEFINITIONS } from './cv-templates';
import { TemplateSelector } from './cv-templates/TemplateSelector';
import { parsedCVToCVData, structuredCVToCVData } from '@/lib/cv-templates/parser';
import { parseOptimizedCVToData } from '@/lib/cv-parser/parse-optimized-cv';
import type { CVData } from '@/lib/cv-templates/types';
import {
  FileText,
  Download,
  CheckCircle,
  TrendingUp,
  Eye,
  FileOutput,
  Copy,
  Check,
  Sparkles,
  ArrowRight,
  Layout,
  ChevronDown,
  ChevronUp,
  Loader2,
  Edit3
} from 'lucide-react';
import { EditableCVCanvas, EditableCVCanvasRef } from './EditableCVCanvas';
import { KarkoAIStepIndicator } from './KarkoAIStepIndicator';
import { useAuth } from '@/contexts/AuthContext';
import { SignUpWallModal } from '@/components/SignUpWallModal';
import { useToast } from './ui/Toast';
import Link from 'next/link';
import { downloadBlob, getCaptureScale, getIsMobileOrTablet } from '@/lib/utils/download-pdf';

// White margin added at the top and bottom of every PDF page (~10mm).
// Content per page = pageHeight - 2×gutter; both the PDF slicer and the
// preview indicator must use the same value so the line matches the cut.
const CV_PAGE_GUTTER_PX = 40;

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

interface CVPanelProps {
  toolbarPortal?: HTMLDivElement | null;
}

export function CVPanel({ toolbarPortal }: CVPanelProps = {}) {
  const {
    currentCV,
    structuredCV,
    currentSession,
    isGenerating,
    isAnalyzing,
    isAgentWorking,
    agentWorkflowPhase,
    profilePhoto,
    setProfilePhoto,
  } = useAppStore();
  const editedOriginalCVData = useCVStore(state => state.editedOriginalCVData);
  const { user, profile, updateProfile } = useAuth();
  const { toast } = useToast();
  const [showSignUpWall, setShowSignUpWall] = useState(false);
  
  const generatedCV = currentSession?.generatedCV;
  const optimizedCVData = currentSession?.optimizedCVData;  // Solution B: Structured JSON from AI
  const gaps = currentSession?.gaps;
  const changes = generatedCV?.changes || [];
  
  const [activeTab, setActiveTab] = useState<'content' | 'changes'>('content');
  const [showOptimized, setShowOptimized] = useState(true);
  const [selectedTemplateId, setSelectedTemplateId] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('karko-default-template') || 'premium-ats';
    }
    return 'premium-ats';
  });
  const [defaultTemplateId, setDefaultTemplateId] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('karko-default-template') || 'premium-ats';
    }
    return 'premium-ats';
  });
  const [showTemplateSelector, setShowTemplateSelector] = useState(false);
  const templateSelectorRef = useRef<HTMLDivElement>(null);
  const templateSelectorBtnRef = useRef<HTMLButtonElement>(null);
  const [copied, setCopied] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editedCVData, setEditedCVData] = useState<CVData | null>(null);
  const [pageBreaks, setPageBreaks] = useState<number[]>([]);
  const cvTemplateRef = useRef<HTMLDivElement>(null);
  const editableCVRef = useRef<EditableCVCanvasRef>(null);

  // Responsive CV scaling — JS-based because CSS transform: scale can't dynamically
  // compensate for the CV template's fixed width (8.5in / 210mm).
  const cvContainerRef = useRef<HTMLDivElement>(null);
  const cvWrapperRef = useRef<HTMLDivElement>(null);
  const [cvScale, setCvScale] = useState(1);
  const [cvScaledHeight, setCvScaledHeight] = useState<number | null>(null);

  // Close template selector when clicking outside
  useEffect(() => {
    if (!showTemplateSelector) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        templateSelectorRef.current && !templateSelectorRef.current.contains(target) &&
        templateSelectorBtnRef.current && !templateSelectorBtnRef.current.contains(target)
      ) {
        setShowTemplateSelector(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showTemplateSelector]);

  useEffect(() => {
    const updateScale = () => {
      if (!cvContainerRef.current || !cvWrapperRef.current) return;
      const containerWidth = cvContainerRef.current.clientWidth;
      // scrollWidth gives the actual rendered width, unaffected by transform: scale
      const naturalWidth = cvWrapperRef.current.scrollWidth;
      const naturalHeight = cvWrapperRef.current.scrollHeight;
      if (containerWidth > 0 && naturalWidth > 0 && containerWidth < naturalWidth) {
        const newScale = containerWidth / naturalWidth;
        setCvScale(newScale);
        setCvScaledHeight(naturalHeight > 0 ? Math.ceil(naturalHeight * newScale) : null);
      } else {
        setCvScale(1);
        setCvScaledHeight(null);
      }
      // Page break indicator positions (in natural pixels, before any CSS transform).
      // Use contentHeightPx (not full pageHeightPx) so the line matches the PDF cut point.
      const isGerman = selectedTemplateId.startsWith('german');
      const pageHeightPx = isGerman ? Math.round((297 / 25.4) * 96) : 1056;
      const contentHeightPx = pageHeightPx - 2 * CV_PAGE_GUTTER_PX;
      const breaks: number[] = [];
      for (let y = contentHeightPx; y < naturalHeight; y += contentHeightPx) {
        breaks.push(y);
      }
      setPageBreaks(breaks);
    };

    // Delay slightly so the CV template renders at its natural size first
    const timer = setTimeout(updateScale, 50);
    // Watch container width changes (window resize, chat panel resize)
    const roContainer = new ResizeObserver(updateScale);
    // Watch CV wrapper height changes (content switches: original ↔ optimized)
    const roWrapper = new ResizeObserver(updateScale);
    if (cvContainerRef.current) roContainer.observe(cvContainerRef.current);
    if (cvWrapperRef.current) roWrapper.observe(cvWrapperRef.current);
    return () => {
      clearTimeout(timer);
      roContainer.disconnect();
      roWrapper.disconnect();
    };
  // selectedTemplateId triggers re-mount of CVTemplateRenderer; ResizeObserver handles rest
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTemplateId]);

  // Refresh photo URL when a Supabase signed URL has expired (long sessions).
  // base64 data URLs are always valid; only re-check external URLs.
  useEffect(() => {
    if (!user || !profilePhoto?.dataUrl) return;
    if (profilePhoto.dataUrl.startsWith('data:')) return;

    const img = new Image();
    img.onerror = async () => {
      try {
        const { getProfilePhotoUrl } = await import('@/lib/supabase/storage');
        const { url } = await getProfilePhotoUrl(user.id);
        if (url) {
          setProfilePhoto({ ...profilePhoto, dataUrl: url });
        }
      } catch { /* ignore */ }
    };
    img.src = profilePhoto.dataUrl;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, profilePhoto?.dataUrl]);

  // Extract stable values from generatedCV to prevent unnecessary re-parses
  // This ensures parsing only happens when content actually changes, not on every render
  const optimizedContent = generatedCV?.content;
  const optimizedTagline = generatedCV?.optimizedTagline;
  const photoDataUrl = profilePhoto?.dataUrl;

  // Parse CV data for template rendering
  // PRIORITY: Use structuredCV (from AI parsing) when available - it has proper skills/languages arrays
  // FALLBACK: Use parsedCVToCVData (re-parses raw text) if structuredCV not available
  const cvData: CVData | null = useMemo(() => {
    if (!currentCV && !structuredCV) return null;
    
    // Use structuredCV if available (properly parsed with arrays for skills, languages, etc.)
    // Otherwise fall back to re-parsing the raw text
    let parsed: CVData;
    if (structuredCV) {
      parsed = structuredCVToCVData(structuredCV);
    } else if (currentCV) {
      parsed = parsedCVToCVData(currentCV);
    } else {
      return null;
    }
    
    // Add profile photo if available
    if (photoDataUrl) {
      parsed.personal.photoUrl = photoDataUrl;
    }
    
    // Load personal links + DOB/nationality from Supabase profile (persisted across sessions)
    if (profile) {
      parsed.personal.linkedIn = parsed.personal.linkedIn || (profile as any).linkedin_url || '';
      parsed.personal.github = parsed.personal.github || (profile as any).github_url || '';
      parsed.personal.portfolio = parsed.personal.portfolio || (profile as any).portfolio_url || '';
      parsed.personal.website = parsed.personal.website || (profile as any).website_url || '';
      parsed.personal.dateOfBirth = parsed.personal.dateOfBirth || (profile as any).date_of_birth || '';
      parsed.personal.nationality = parsed.personal.nationality || (profile as any).nationality || '';
    }
    
    // SOLUTION B: If we have optimizedCVData (structured JSON from AI), use it directly
    // This eliminates text parsing and prevents duplication issues
    if (showOptimized && optimizedCVData) {
      // Convert optimizedCVData to CVData format
      // IMPORTANT: Preserve personal links from original CV if AI didn't return them
      // This prevents users from re-entering LinkedIn/GitHub/Portfolio/Website for each application
      const directData: CVData = {
        personal: {
          fullName: optimizedCVData.personal.fullName,
          email: optimizedCVData.personal.email,
          phone: optimizedCVData.personal.phone || '',
          currentTitle: optimizedCVData.personal.currentTitle,
          address: optimizedCVData.personal.address || parsed?.personal.address,
          city: optimizedCVData.personal.city || parsed?.personal.city,
          country: optimizedCVData.personal.country || parsed?.personal.country,
          linkedIn: optimizedCVData.personal.linkedIn || parsed?.personal.linkedIn,
          website: optimizedCVData.personal.website || parsed?.personal.website,
          github: optimizedCVData.personal.github || parsed?.personal.github,
          portfolio: parsed?.personal.portfolio,
          photoUrl: photoDataUrl,
          dateOfBirth: parsed?.personal.dateOfBirth,
          nationality: parsed?.personal.nationality,
        },
        summary: optimizedCVData.summary,
        experience: optimizedCVData.experience,
        education: optimizedCVData.education,
        skills: optimizedCVData.skills,
        languages: optimizedCVData.languages,
        certifications: optimizedCVData.certifications,
        projects: optimizedCVData.projects || undefined,
        customSections: optimizedCVData.customSections || undefined,
        additionalInfo: optimizedCVData.additionalInfo || (optimizedCVData.personal.driverLicense
          ? [`Driver's License: ${optimizedCVData.personal.driverLicense}`]
          : undefined),
        sectionHeaders: optimizedCVData.sectionHeaders,
        localizedStrings: optimizedCVData.localizedStrings,
      };
      
      return directData;
    }
    
    // FALLBACK: If no optimizedCVData, use legacy text parsing
    if (showOptimized && optimizedContent) {
      const optimizedData = parseOptimizedCVToData(optimizedContent, parsed);
      
      if (optimizedTagline) {
        optimizedData.personal.currentTitle = optimizedTagline;
      }
      
      if (photoDataUrl) {
        optimizedData.personal.photoUrl = photoDataUrl;
      }
      
      // Preserve personal links from original CV if not in optimized
      if (parsed) {
        optimizedData.personal.linkedIn = optimizedData.personal.linkedIn || parsed.personal.linkedIn;
        optimizedData.personal.github = optimizedData.personal.github || parsed.personal.github;
        optimizedData.personal.website = optimizedData.personal.website || parsed.personal.website;
        optimizedData.personal.portfolio = optimizedData.personal.portfolio || parsed.personal.portfolio;
      }
      
      return optimizedData;
    }

    // Prefer edited original CV data if available (when viewing original tab)
    if (!showOptimized && editedOriginalCVData) {
      const merged = { ...editedOriginalCVData };
      // Merge photo + profile links
      if (photoDataUrl) {
        merged.personal.photoUrl = photoDataUrl;
      }
      if (profile) {
        merged.personal.linkedIn = merged.personal.linkedIn || (profile as any).linkedin_url || '';
        merged.personal.github = merged.personal.github || (profile as any).github_url || '';
        merged.personal.portfolio = merged.personal.portfolio || (profile as any).portfolio_url || '';
        merged.personal.website = merged.personal.website || (profile as any).website_url || '';
        merged.personal.dateOfBirth = merged.personal.dateOfBirth || (profile as any).date_of_birth || '';
        merged.personal.nationality = merged.personal.nationality || (profile as any).nationality || '';
      }
      return merged;
    }

    return parsed;
  }, [currentCV, structuredCV, optimizedContent, optimizedTagline, showOptimized, photoDataUrl, optimizedCVData, profile, editedOriginalCVData]);

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Clipboard write failed:', err);
    }
  };

  const handleDownloadPDF = async () => {
    // Gate: Anonymous users must sign up to download
    if (!user) {
      setShowSignUpWall(true);
      return;
    }
    if (!cvTemplateRef.current || !cvData) return;

    setIsDownloading(true);
    // Step tracking for mobile diagnostics — the step name is shown in the
    // error toast so the user can report exactly where the failure occurs.
    let step = 'init';
    try {
      step = 'import';
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import('html2canvas'),
        import('jspdf'),
      ]);

      const sanitize = (s: string) =>
        s.replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
      const applicantName = sanitize(cvData.personal.fullName || 'Applicant');
      const companyName = sanitize(currentSession?.company || '');
      const filename =
        showOptimized && companyName
          ? `${applicantName}_${companyName}_CV.pdf`
          : `${applicantName}_CV.pdf`;

      const isGerman = selectedTemplateId.startsWith('german');
      const pageWidthMm = isGerman ? 210 : 215.9;
      const pageHeightMm = isGerman ? 297 : 279.4;
      // Page height in natural pixels at 96 dpi
      const pageHeightNaturalPx = isGerman ? Math.round((297 / 25.4) * 96) : 1056;
      const isMobile = getIsMobileOrTablet();
      const el = cvTemplateRef.current;

      step = 'css-clean';
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
      const photoSrc = cvData.personal.photoUrl;
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
      step = 'capture';

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

      step = 'pdf-build';

      // Validate the capture canvas — on mobile Safari, html2canvas can return
      // a canvas with 0x0 dimensions when the output exceeds internal limits.
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
        const pageCanvas = document.createElement('canvas');
        pageCanvas.width = canvas.width;
        pageCanvas.height = pageCanvasH;
        const ctx = pageCanvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
          ctx.drawImage(canvas, 0, srcY, canvas.width, srcH, 0, gutterCanvasH, canvas.width, srcH);
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
          const yOnPage = gutterNaturalPx + yOnContent;

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

      step = 'download';
      const blob = doc.output('blob');
      await downloadBlob(blob, filename);
      toast.success('PDF downloaded!');
    } catch (err) {
      console.error('PDF generation failed:', err);
      // Show step name + short error for mobile diagnostics
      const errMsg = err instanceof Error ? err.message.slice(0, 80) : 'Unknown error';
      toast.error(`PDF failed at [${step}]: ${errMsg}`);
    } finally {
      setIsDownloading(false);
    }
  };

  const selectedTemplate = CV_TEMPLATE_DEFINITIONS.find(t => t.id === selectedTemplateId);

  if (!currentCV) {
    return (
      <div className="h-full flex items-center justify-center bg-cream-50 p-8">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 rounded-2xl bg-cream-100 flex items-center justify-center mx-auto mb-5">
            <FileText className="w-8 h-8 text-cream-400" />
          </div>
          <h3 className="text-lg font-semibold text-charcoal mb-2">No CV uploaded</h3>
          <p className="text-sm text-warm-gray mb-6 leading-relaxed">
            Upload your CV in the Documents section to get started with AI-powered optimization.
          </p>
          <Link href="/documents">
            <Button variant="gold">
              Go to Documents
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const isLoading = isAnalyzing || isGenerating || isAgentWorking;
  const displayContent = showOptimized && generatedCV ? generatedCV.content : currentCV.rawText;

  // Toolbar content — rendered via portal (desktop) or inline (mobile)
  const toolbarContent = !isLoading ? (
    <>
      {/* Original/Optimized Toggle */}
      {generatedCV && (
        <div className="flex items-center bg-cream-100/80 rounded-lg p-0.5 flex-shrink-0">
          <button
            onClick={() => { setShowOptimized(false); setEditedCVData(null); }}
            className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-all cursor-pointer ${
              !showOptimized ? 'bg-white text-navy-700 shadow-sm font-semibold' : 'text-warm-gray hover:text-charcoal'
            }`}
          >
            Original
          </button>
          <button
            onClick={() => { setShowOptimized(true); setEditedCVData(null); }}
            className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-all cursor-pointer ${
              showOptimized ? 'bg-white text-navy-700 shadow-sm font-semibold' : 'text-warm-gray hover:text-charcoal'
            }`}
          >
            Optimized
          </button>
        </div>
      )}

      {/* Content/Changes Toggle — only when Optimized is selected */}
      {showOptimized && generatedCV && (
        <div className="flex items-center bg-cream-100/80 rounded-lg p-0.5 flex-shrink-0">
          <button
            onClick={() => setActiveTab('content')}
            className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md transition-all cursor-pointer ${
              activeTab === 'content' ? 'bg-white text-navy-700 shadow-sm font-semibold' : 'text-warm-gray hover:text-charcoal'
            }`}
          >
            <Eye className="w-3 h-3" />
            Content
          </button>
          <button
            onClick={() => setActiveTab('changes')}
            className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md transition-all cursor-pointer ${
              activeTab === 'changes' ? 'bg-white text-navy-700 shadow-sm font-semibold' : 'text-warm-gray hover:text-charcoal'
            }`}
          >
            <Sparkles className={`w-3 h-3 ${activeTab === 'changes' ? 'text-gold-500' : ''}`} />
            Changes {changes.length > 0 && `(${changes.length})`}
          </button>
        </div>
      )}

      {/* Template selector button */}
      {activeTab === 'content' && !isEditMode && (
        <button
          ref={templateSelectorBtnRef}
          onClick={() => setShowTemplateSelector(!showTemplateSelector)}
          className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-white border border-cream-200 rounded-lg hover:bg-cream-50 hover:border-gold-300 transition-all cursor-pointer flex-shrink-0"
        >
          <Layout className="w-3 h-3 text-navy-500" />
          <span className="hidden sm:inline">{selectedTemplate?.name || 'Template'}</span>
          {showTemplateSelector ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>
      )}

      {/* Edit button */}
      {activeTab === 'content' && !isEditMode && cvData && (
        <button
          onClick={() => {
            setIsEditMode(true);
            if (cvData && !editedCVData) setEditedCVData(cvData);
          }}
          className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-white border border-cream-200 rounded-lg hover:bg-cream-50 hover:border-gold-300 transition-all cursor-pointer flex-shrink-0"
        >
          <Edit3 className="w-3 h-3 text-navy-500" />
          <span className="hidden sm:inline">Edit</span>
        </button>
      )}

      {/* Edit mode indicators */}
      {isEditMode && (
        <>
          <span className="text-xs font-medium text-navy-600 flex-shrink-0">Editing</span>
          <button
            onClick={() => { setIsEditMode(false); setEditedCVData(null); }}
            className="px-2.5 py-1.5 text-xs font-medium text-warm-gray hover:text-charcoal rounded-md hover:bg-cream-100 transition-all cursor-pointer flex-shrink-0"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              // Save changes via ref, then exit edit mode
              editableCVRef.current?.save();
              setIsEditMode(false);
            }}
            className="px-2.5 py-1.5 text-xs font-semibold text-white bg-navy-600 hover:bg-navy-700 rounded-md transition-all cursor-pointer flex-shrink-0"
          >
            <Check className="w-3 h-3 inline mr-1" />
            Save Changes
          </button>
        </>
      )}

      {/* Action buttons — visible when content tab is active and not editing */}
      {activeTab === 'content' && !isEditMode && (
        <>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleCopy(displayContent)}
            title="Copy to clipboard"
            className="flex-shrink-0"
          >
            {copied ? <Check className="w-4 h-4 text-gold-600" /> : <Copy className="w-4 h-4" />}
          </Button>
          <Button
            variant="gold"
            size="sm"
            onClick={handleDownloadPDF}
            disabled={isDownloading || !cvData}
            title="Download as PDF"
            className="flex-shrink-0"
          >
            {isDownloading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            <span className="ml-1 hidden sm:inline">PDF</span>
          </Button>
        </>
      )}
    </>
  ) : null;

  return (
    <div className="h-full flex flex-col bg-cream-50">
      {/* Toolbar: portal to tab bar on desktop, inline on mobile */}
      {toolbarContent && toolbarPortal && createPortal(toolbarContent, toolbarPortal)}
      {toolbarContent && !toolbarPortal && (
        <div className="px-2.5 sm:px-4 py-1.5 sm:py-2 glass-toolbar flex-shrink-0 relative">
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide pr-6">
            {toolbarContent}
          </div>
          {/* Right-fade hint that toolbar is scrollable on mobile */}
          <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-white/80 to-transparent pointer-events-none sm:hidden" />
        </div>
      )}

      {/* Content Area */}
      <div className="flex-1 overflow-hidden">
        {isLoading ? (
          <KarkoAIStepIndicator
            stepType="cv"
            isLoading={true}
            title={agentWorkflowPhase === 'fit_analysis' ? 'Analyzing Fit' : undefined}
            message={agentWorkflowPhase === 'fit_analysis'
              ? 'Matching your profile to this role...'
              : isAnalyzing
                ? 'Understanding job requirements...'
                : 'Tailoring your CV for this role...'
            }
            statusLabel={agentWorkflowPhase === 'fit_analysis' ? 'Analyzing...' : undefined}
          />
        ) : activeTab === 'content' ? (
          <div className="h-full flex flex-col">
            {/* Template Selector Dropdown - Scrollable */}
            {showTemplateSelector && !isEditMode && (
              <div ref={templateSelectorRef} className="px-4 py-4 bg-white border-b border-cream-300 shadow-sm max-h-[60vh] overflow-y-auto">
                <TemplateSelector
                  selectedTemplateId={selectedTemplateId}
                  onSelect={(id) => {
                    setSelectedTemplateId(id);
                    setShowTemplateSelector(false);
                  }}
                  defaultTemplateId={defaultTemplateId}
                  onSetDefault={(id) => {
                    localStorage.setItem('karko-default-template', id);
                    setDefaultTemplateId(id);
                  }}
                />
              </div>
            )}

            {/* CV Content - View Mode or Edit Mode */}
            <div className="flex-1 overflow-auto p-2 sm:p-6 bg-gray-100">
              {isEditMode && cvData ? (
                /* Edit Mode - Editable Canvas */
                <div className="flex flex-col h-full">
                  <EditableCVCanvas
                    ref={editableCVRef}
                    cvData={editedCVData || cvData}
                    onSave={(updatedData) => {
                      setEditedCVData(updatedData);

                      // Persist edits to store and Supabase
                      if (showOptimized && generatedCV) {
                        // For optimized CV, update session store (auto-syncs to Supabase)
                        useSessionStore.getState().updateCurrentSession({
                          optimizedCVData: updatedData as any
                        });
                      } else {
                        // For original CV, persist to CV store (syncs to Supabase via useSupabaseSync)
                        useCVStore.getState().setEditedOriginalCVData(updatedData);
                      }

                      // Save personal links to profiles table
                      const p = updatedData.personal;
                      const linkUpdates: Record<string, string | null> = {};
                      if (p.linkedIn !== undefined) linkUpdates.linkedin_url = p.linkedIn || null;
                      if (p.github !== undefined) linkUpdates.github_url = p.github || null;
                      if (p.portfolio !== undefined) linkUpdates.portfolio_url = p.portfolio || null;
                      if (p.website !== undefined) linkUpdates.website_url = p.website || null;
                      if (p.dateOfBirth !== undefined) linkUpdates.date_of_birth = p.dateOfBirth || null;
                      if (p.nationality !== undefined) linkUpdates.nationality = p.nationality || null;
                      if (Object.keys(linkUpdates).length > 0) {
                        updateProfile(linkUpdates as any).catch((err: any) =>
                          console.error('[CVPanel] Failed to save personal links:', err)
                        );
                      }
                    }}
                    onAIImprove={async (section, content) => {
                      return content;
                    }}
                  />
                </div>
              ) : cvData ? (
                /* View Mode - Template Preview */
                <div ref={cvContainerRef} className="flex flex-col items-center">
                  {/* Size wrapper: reserves the correct visual space after scaling,
                      and clips the layout overflow that transform: scale doesn't affect */}
                  <div
                    style={{
                      width: cvScale < 1 ? Math.ceil((cvWrapperRef.current?.scrollWidth ?? 816) * cvScale) : undefined,
                      height: cvScaledHeight ?? undefined,
                      overflow: cvScale < 1 ? 'hidden' : undefined,
                    }}
                  >
                    <div
                      ref={cvWrapperRef}
                      className="relative bg-white shadow-lg"
                      style={cvScale < 1 ? {
                        transform: `scale(${cvScale})`,
                        transformOrigin: 'top left',
                        willChange: 'transform',
                      } : undefined}
                    >
                      <div ref={cvTemplateRef}>
                        <CVTemplateRenderer data={editedCVData || cvData} templateId={selectedTemplateId} />
                      </div>
                      {/* Page break indicators — outside cvTemplateRef so not captured in PDF.
                          Band spans CV_PAGE_GUTTER_PX above + below the cut point, mirroring
                          the white margins that will appear in the downloaded PDF. */}
                      {pageBreaks.map((y, i) => (
                        <div
                          key={y}
                          style={{
                            position: 'absolute',
                            top: y - CV_PAGE_GUTTER_PX,
                            left: 0,
                            right: 0,
                            height: CV_PAGE_GUTTER_PX * 2,
                            background: 'rgba(148, 163, 184, 0.1)',
                            borderTop: '1px dashed #CBD5E0',
                            borderBottom: '1px dashed #CBD5E0',
                            pointerEvents: 'none',
                            zIndex: 10,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'flex-end',
                            paddingRight: 10,
                          }}
                        >
                          <span style={{
                            fontSize: 10,
                            color: '#94A3B8',
                            background: 'rgba(255, 255, 255, 0.9)',
                            padding: '1px 5px',
                            borderRadius: 3,
                            fontWeight: 400,
                            lineHeight: 1.4,
                          }}>
                            Page {i + 1} | Page {i + 2}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <Card className="bg-white">
                  <pre className="whitespace-pre-wrap font-sans text-sm text-charcoal leading-relaxed">
                    {displayContent}
                  </pre>
                </Card>
              )}
            </div>
          </div>
        ) : (
          <div className="h-full overflow-auto p-6">
            {/* NEW: Use analysis from optimizedCVData (Solution B) */}
            {optimizedCVData?.analysis ? (
              <div className="space-y-6">
                {/* 1. Strategy Summary */}
                <div className="bg-gradient-to-r from-navy-50 to-navy-100 p-4 rounded-lg border border-navy-200">
                  <h3 className="font-bold text-navy-800 mb-2 flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-gold-600" />
                    Optimization Strategy
                  </h3>
                  <p className="text-navy-700 text-sm">{optimizedCVData.analysis.summary}</p>
                </div>

                {/* 2. ATS Compatibility Score */}
                <div className="bg-cream-50 p-4 rounded-lg border border-cream-200">
                  <h3 className="font-bold text-navy-800 mb-2">ATS Compatibility</h3>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 bg-cream-200 rounded-full h-3">
                      <div 
                        className="bg-gradient-to-r from-gold-400 to-gold-500 h-3 rounded-full transition-all duration-500"
                        style={{ width: `${optimizedCVData.analysis.ats_compatibility}%` }}
                      />
                    </div>
                    <span className="font-bold text-navy-700 text-lg">
                      {optimizedCVData.analysis.ats_compatibility}%
                    </span>
                  </div>
                </div>

                {/* 3. Key Changes List */}
                <div>
                  <h3 className="font-bold mb-3 flex items-center gap-2 text-navy-800">
                    <Sparkles className="w-4 h-4 text-gold-500" />
                    Key Improvements Made
                  </h3>
                  <ul className="space-y-2">
                    {optimizedCVData.analysis.key_changes.map((change, i) => (
                      <li key={i} className="flex items-start gap-2 p-3 bg-white rounded-lg border border-cream-200 shadow-sm">
                        <CheckCircle className="w-4 h-4 text-gold-500 mt-0.5 flex-shrink-0" />
                        <span className="text-sm text-charcoal">{change}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* 4. Missing Keywords Added */}
                {optimizedCVData.analysis.missing_keywords_added.length > 0 && (
                  <div>
                    <h3 className="font-bold mb-3 text-navy-800">Keywords Added for ATS</h3>
                    <div className="flex flex-wrap gap-2">
                      {optimizedCVData.analysis.missing_keywords_added.map((keyword, i) => (
                        <span 
                          key={i} 
                          className="px-3 py-1.5 bg-gold-50 text-gold-700 rounded-full text-sm font-medium border border-gold-200"
                        >
                          + {keyword}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : changes.length > 0 ? (
              /* Fallback: Legacy changes format */
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-4">
                  <Sparkles className="w-5 h-5 text-navy-600" />
                  <h3 className="font-medium text-charcoal">
                    {changes.length} strategic changes made
                  </h3>
                </div>
                {changes.map((change, index) => (
                  <Card key={index} padding="sm" className="border-l-4 border-l-navy-500">
                    <div className="flex items-start gap-3">
                      <div className="p-1.5 bg-navy-100 rounded">
                        <FileOutput className="w-3.5 h-3.5 text-navy-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-charcoal">{change.section}</p>
                        <p className="text-xs text-warm-gray mb-2">{change.reason}</p>
                        {change.original && (
                          <div className="space-y-2">
                            <div className="p-2 bg-red-50 rounded text-xs text-red-700 border border-red-100">
                              <span className="font-medium">Before: </span>
                              {change.original}
                            </div>
                            <div className="p-2 bg-gold-50 rounded text-xs text-gold-700 border border-gold-100">
                              <span className="font-medium">After: </span>
                              {change.updated}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <Sparkles className="w-12 h-12 text-cream-400 mb-4" />
                <h3 className="font-medium text-charcoal">No changes yet</h3>
                <p className="text-sm text-warm-gray mt-1">
                  Paste a job description in the chat to optimize your CV
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Sign Up Wall Modal */}
      <SignUpWallModal
        isOpen={showSignUpWall}
        onClose={() => setShowSignUpWall(false)}
        trigger="download"
      />
    </div>
  );
}
