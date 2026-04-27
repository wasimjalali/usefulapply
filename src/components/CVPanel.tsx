'use client';

import { useState, useMemo, useRef, useCallback, useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { useAppStore } from '@/store/useAppStore';
import { useCVStore } from '@/store/useCVStore';
import { useSessionStore } from '@/store/useSessionStore';
import { CVTemplateRenderer, CV_TEMPLATE_DEFINITIONS } from './cv-templates';
import { TemplateSelector } from './cv-templates/TemplateSelector';
import { structuredCVToCVData } from '@/lib/cv-templates/parser';
import type { CVData } from '@/lib/cv-templates/types';
import {
  FileText,
  Download,
  Copy,
  Check,
  ArrowRight,
  Layout,
  ChevronDown,
  ChevronUp,
  Loader2,
  Edit3,
  Maximize2,
  X,
  Camera,
  Trash2,
} from 'lucide-react';
import { uploadProfilePhoto } from '@/lib/supabase/storage';
import type { ProfilePhoto } from '@/store/useCVStore';
import { EditableCVCanvas, EditableCVCanvasRef } from './EditableCVCanvas';
import { KarkoAIStepIndicator } from './KarkoAIStepIndicator';
import { useAuth } from '@/contexts/AuthContext';
import { SignUpWallModal } from '@/components/SignUpWallModal';
import { useToast } from './ui/Toast';
import { downloadBlob, getCaptureScale, getIsMobileOrTablet } from '@/lib/utils/download-pdf';

// White margin added at the top and bottom of every PDF page (~10mm).
// Content per page = pageHeight - 2×gutter; both the PDF slicer and the
// preview indicator must use the same value so the line matches the cut.
const CV_PAGE_GUTTER_PX = 40;

const PHOTO_TEMPLATE_IDS = new Set(['german-ats', 'german-classic']);

function resizeImage(file: File, maxSize: number, quality = 0.9): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Image load failed'));
      img.onload = () => {
        let w = img.naturalWidth;
        let h = img.naturalHeight;
        if (w > maxSize || h > maxSize) {
          if (w > h) { h = Math.round(h * (maxSize / w)); w = maxSize; }
          else { w = Math.round(w * (maxSize / h)); h = maxSize; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Could not get 2d context'));
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

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
  atsControl?: ReactNode;
}

export function CVPanel({ toolbarPortal, atsControl }: CVPanelProps = {}) {
  const router = useRouter();
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
  const [templatePopoverPos, setTemplatePopoverPos] = useState<{ top: number; left: number; maxHeight: number; width: number } | null>(null);
  const templateSelectorRef = useRef<HTMLDivElement>(null);
  const templateSelectorBtnRef = useRef<HTMLButtonElement>(null);
  const [copied, setCopied] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [showFullPreview, setShowFullPreview] = useState(false);
  const [editedCVData, setEditedCVData] = useState<CVData | null>(null);
  const [pageBreaks, setPageBreaks] = useState<number[]>([]);
  const cvTemplateRef = useRef<HTMLDivElement>(null);
  const editableCVRef = useRef<EditableCVCanvasRef>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const isPhotoTemplate = PHOTO_TEMPLATE_IDS.has(selectedTemplateId);

  const handlePhotoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = '';

    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file (JPG, PNG, etc.)');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be less than 5MB');
      return;
    }

    try {
      const dataUrl = await resizeImage(file, 800);
      const photo: ProfilePhoto = {
        id: `photo-${Date.now()}`,
        fileName: file.name,
        dataUrl,
        uploadedAt: new Date().toISOString(),
      };
      setProfilePhoto(photo);

      if (user) {
        try {
          const { url, error } = await uploadProfilePhoto(user.id, file);
          if (error) {
            console.error('Photo upload to Supabase failed:', error);
            toast.warning('Photo saved locally — cloud sync failed');
          } else if (url) {
            setProfilePhoto({ ...photo, dataUrl: url });
          }
        } catch (err) {
          console.error('Photo upload exception:', err);
        }
      }
    } catch {
      toast.error('Failed to process image');
    }
  };

  // Responsive CV scaling — JS-based because CSS transform: scale can't dynamically
  // compensate for the CV template's fixed width (8.5in / 210mm).
  const cvContainerRef = useRef<HTMLDivElement>(null);
  const cvWrapperRef = useRef<HTMLDivElement>(null);
  const [cvScale, setCvScale] = useState(1);
  const [cvScaledHeight, setCvScaledHeight] = useState<number | null>(null);

  // Close template selector when clicking outside, on Escape, or on resize/scroll
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
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowTemplateSelector(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKey);
    };
  }, [showTemplateSelector]);

  // Anchor popover to the Templates button — reposition on scroll/resize.
  useEffect(() => {
    if (!showTemplateSelector) {
      setTemplatePopoverPos(null);
      return;
    }
    const MIN_WIDTH = 320;
    const MARGIN = 12;
    const updatePosition = () => {
      const btn = templateSelectorBtnRef.current;
      if (!btn) return;
      const rect = btn.getBoundingClientRect();
      const viewportW = window.innerWidth;
      const viewportH = window.innerHeight;
      const top = rect.bottom + 8;
      // Find the CV panel container so the popover spans its full width.
      // The button lives inside the tab-bar area whose parent is the flex-1 document panel.
      const cvPanel = btn.closest('.flex-1.flex.flex-col') as HTMLElement | null;
      const panelLeft = cvPanel ? cvPanel.getBoundingClientRect().left + MARGIN : MARGIN;
      const panelRight = cvPanel ? cvPanel.getBoundingClientRect().right - MARGIN : rect.right;
      const width = Math.max(MIN_WIDTH, panelRight - panelLeft);
      const left = panelLeft;
      const maxHeight = Math.max(240, viewportH - top - MARGIN);
      setTemplatePopoverPos({ top, left, maxHeight, width });
    };
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [showTemplateSelector]);

  useEffect(() => {
    let rafId: number | null = null;

    const updateScale = () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        rafId = null;
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
      });
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
      if (rafId !== null) cancelAnimationFrame(rafId);
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

  // Parse CV data for template rendering using structuredCV from AI parsing
  const cvData: CVData | null = useMemo(() => {
    if (!structuredCV) return null;

    let parsed: CVData = structuredCVToCVData(structuredCV);
    
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
  }, [structuredCV, optimizedContent, optimizedTagline, showOptimized, photoDataUrl, optimizedCVData, profile, editedOriginalCVData]);

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


  if (!currentCV) {
    return (
      <div className="h-full flex items-center justify-center bg-cream-50 p-8">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 rounded-2xl bg-cream-100 flex items-center justify-center mx-auto mb-5">
            <FileText className="w-8 h-8 text-cream-400" />
          </div>
          <h3 className="text-lg font-serif font-semibold tracking-tight text-charcoal mb-2">No CV uploaded</h3>
          <p className="text-sm text-warm-gray mb-6 leading-relaxed">
            Upload your CV from the Documents library to get started with AI-powered optimization.
          </p>
          <Button variant="gold" onClick={() => router.push('/documents')}>
            Open Documents
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </div>
    );
  }

  const isLoading = isAnalyzing || isGenerating || isAgentWorking;
  const displayContent = showOptimized && generatedCV ? generatedCV.content : currentCV.rawText;
  const previewCVData = editedCVData || cvData;

  // Toolbar content — rendered via portal (desktop) or inline (mobile)
  const toolbarContent = !isLoading ? (
    <>
      {/* Original/Optimized Toggle */}
      {generatedCV && (
        <div className="flex items-center bg-cream-50 border border-cream-200 rounded-2xl p-0.5 shadow-sm flex-shrink-0">
          <button
            onClick={() => { setShowOptimized(false); setEditedCVData(null); }}
            className={`px-3.5 py-2 text-sm font-medium rounded-lg transition-all cursor-pointer ${
              !showOptimized ? 'bg-navy-700 text-white shadow-sm font-semibold' : 'text-warm-gray hover:text-charcoal'
            }`}
          >
            Original
          </button>
          <button
            onClick={() => { setShowOptimized(true); setEditedCVData(null); }}
            className={`px-3.5 py-2 text-sm font-medium rounded-lg transition-all cursor-pointer ${
              showOptimized ? 'bg-navy-700 text-white shadow-sm font-semibold' : 'text-warm-gray hover:text-charcoal'
            }`}
          >
            Optimized
          </button>
        </div>
      )}

      {/* Template selector button */}
      {!isEditMode && (
        <button
          ref={templateSelectorBtnRef}
          onClick={() => setShowTemplateSelector(!showTemplateSelector)}
          className="flex items-center gap-2 px-3.5 py-2 text-sm font-medium bg-white border border-cream-200 rounded-2xl hover:bg-cream-50 hover:border-gold-300 transition-all cursor-pointer flex-shrink-0 shadow-sm"
        >
          <Layout className="w-4 h-4 text-navy-500" />
          <span>Templates</span>
          {showTemplateSelector ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      )}

      {/* Photo upload button — only for photo-supporting templates */}
      {!isEditMode && isPhotoTemplate && (
        <>
          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            onChange={handlePhotoUpload}
            className="hidden"
          />
          {profilePhoto ? (
            <div className="group relative flex-shrink-0">
              <button
                onClick={() => photoInputRef.current?.click()}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-gold-300 bg-gold-50 text-navy-600 shadow-sm transition-all hover:bg-gold-100 hover:border-gold-400"
                title={`Change photo (${profilePhoto.fileName})`}
                aria-label={`Change photo (${profilePhoto.fileName})`}
              >
                <Camera className="h-4 w-4" />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setProfilePhoto(null); }}
                className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-white text-warm-gray opacity-0 shadow ring-1 ring-cream-300 transition-opacity hover:text-red-500 group-hover:opacity-100"
                title="Remove photo"
                aria-label="Remove photo"
              >
                <Trash2 className="h-2.5 w-2.5" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => photoInputRef.current?.click()}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-cream-200 bg-white text-navy-500 shadow-sm transition-all hover:bg-cream-50 hover:border-gold-300 flex-shrink-0"
              title="Upload photo for CV"
              aria-label="Upload photo for CV"
            >
              <Camera className="h-4 w-4" />
            </button>
          )}
        </>
      )}

      {/* Edit button */}
      {!isEditMode && cvData && (
        <button
          onClick={() => {
            setIsEditMode(true);
            if (cvData && !editedCVData) setEditedCVData(cvData);
          }}
          className="flex items-center gap-2 px-3.5 py-2 text-sm font-medium bg-white border border-cream-200 rounded-2xl hover:bg-cream-50 hover:border-gold-300 transition-all cursor-pointer flex-shrink-0 shadow-sm"
        >
          <Edit3 className="w-4 h-4 text-navy-500" />
          <span>Edit</span>
        </button>
      )}

      {/* Edit mode indicators */}
      {isEditMode && (
        <>
          <span className="text-sm font-semibold text-navy-600 flex-shrink-0">Editing</span>
          <button
            onClick={() => { setIsEditMode(false); setEditedCVData(null); }}
            className="px-3.5 py-2 text-sm font-medium text-warm-gray hover:text-charcoal rounded-2xl hover:bg-cream-100 transition-all cursor-pointer flex-shrink-0"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              // Save changes via ref, then exit edit mode
              editableCVRef.current?.save();
              setIsEditMode(false);
            }}
            className="px-3.5 py-2 text-sm font-semibold text-white bg-navy-600 hover:bg-navy-700 rounded-2xl transition-all cursor-pointer flex-shrink-0 shadow-sm"
          >
            <Check className="w-4 h-4 inline mr-1.5" />
            Save Changes
          </button>
        </>
      )}

      {/* Action buttons — visible when not editing */}
      {!isEditMode && (
        <>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleCopy(displayContent)}
            title="Copy to clipboard"
            className="flex-shrink-0 rounded-2xl bg-white border border-cream-200 hover:bg-cream-50 shadow-sm"
          >
            {copied ? <Check className="w-4 h-4 text-gold-600 mr-1.5" /> : <Copy className="w-4 h-4 mr-1.5" />}
            Copy
          </Button>
          <Button
            variant="gold"
            size="sm"
            onClick={handleDownloadPDF}
            disabled={isDownloading || !cvData}
            title="Download as PDF"
            className="flex-shrink-0 rounded-2xl shadow-sm"
          >
            {isDownloading ? (
              <Loader2 className="w-4 h-4 animate-spin mr-1.5" />
            ) : (
              <Download className="w-4 h-4 mr-1.5" />
            )}
            Download PDF
          </Button>
        </>
      )}

      {atsControl}
    </>
  ) : null;

  const templatePopover = showTemplateSelector && !isEditMode && templatePopoverPos && typeof document !== 'undefined'
    ? createPortal(
        <div
          ref={templateSelectorRef}
          style={{
            position: 'fixed',
            top: templatePopoverPos.top,
            left: templatePopoverPos.left,
            width: templatePopoverPos.width,
            maxHeight: templatePopoverPos.maxHeight,
            zIndex: 60,
          }}
          className="rounded-2xl border border-cream-200 bg-white shadow-md overflow-y-auto p-4"
          role="dialog"
          aria-label="Select CV template"
        >
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
        </div>,
        document.body
      )
    : null;

  return (
    <div className="h-full flex flex-col bg-cream-50">
      {templatePopover}
      {/* Toolbar: portal to tab bar on desktop, inline on mobile */}
      {toolbarContent && toolbarPortal && createPortal(toolbarContent, toolbarPortal)}
      {toolbarContent && !toolbarPortal && (
        <div className="px-3 sm:px-5 py-2.5 bg-cream-100 border-b border-gold-300/60 flex-shrink-0 relative">
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide pr-6">
            {toolbarContent}
          </div>
          {/* Right-fade hint that toolbar is scrollable on mobile */}
          <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-cream-100/80 to-transparent pointer-events-none sm:hidden" />
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
        ) : (
          <div className="h-full flex flex-col">

            {/* CV Content - View Mode or Edit Mode */}
            <div className="flex-1 overflow-auto bg-cream-100 p-2 sm:p-6">
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
                        // Preserve analysis, sectionHeaders, localizedStrings from original optimizedCVData
                        const existing = useSessionStore.getState().currentSession?.optimizedCVData;
                        useSessionStore.getState().updateCurrentSession({
                          optimizedCVData: {
                            ...updatedData,
                            analysis: existing?.analysis,
                            sectionHeaders: existing?.sectionHeaders,
                            localizedStrings: existing?.localizedStrings,
                          } as any
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
                    className="relative"
                    style={{
                      width: cvScale < 1 ? Math.ceil((cvWrapperRef.current?.scrollWidth ?? 816) * cvScale) : undefined,
                      height: cvScaledHeight ?? undefined,
                      overflow: cvScale < 1 ? 'hidden' : undefined,
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => setShowFullPreview(true)}
                      className="absolute right-3 top-3 z-20 inline-flex items-center gap-1.5 rounded-full border border-cream-200 bg-cream-50 px-3 py-1.5 text-xs font-semibold text-navy-700 shadow-sm transition-all hover:-translate-y-0.5 hover:border-gold-200 hover:shadow-md cursor-pointer"
                    >
                      <Maximize2 className="w-3.5 h-3.5" />
                      Full Preview
                    </button>
                    <div
                      ref={cvWrapperRef}
                      className="relative bg-white shadow-md"
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
                          Keep the marker minimal so it communicates the split without obscuring content. */}
                      {pageBreaks.map((y, i) => (
                        <div
                          key={y}
                          style={{
                            position: 'absolute',
                            top: y,
                            right: 10,
                            transform: 'translateY(-50%)',
                            pointerEvents: 'none',
                            zIndex: 10,
                          }}
                        >
                          <span style={{
                            fontSize: 11,
                            color: '#B8891C',
                            background: 'rgba(248, 244, 234, 0.96)',
                            padding: '3px 8px',
                            borderRadius: 999,
                            fontWeight: 600,
                            lineHeight: 1.2,
                            border: '1px solid rgba(212, 175, 55, 0.45)',
                            boxShadow: '0 8px 18px -14px rgba(30, 58, 95, 0.25)',
                          }}>
                            Page {i + 1} → {i + 2}
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
        )}
      </div>

      {/* Sign Up Wall Modal */}
      <SignUpWallModal
        isOpen={showSignUpWall}
        onClose={() => setShowSignUpWall(false)}
        trigger="download"
      />

      {showFullPreview && previewCVData && createPortal(
        <div className="fixed inset-0 z-[220] flex items-center justify-center bg-navy-950/45 p-4 backdrop-blur-[2px]">
          <div className="relative flex h-[92vh] w-full max-w-[1120px] flex-col overflow-hidden rounded-[24px] border border-cream-200 bg-cream-100 shadow-lg">
            <div className="flex items-center justify-between border-b border-cream-200 bg-cream-50 px-5 py-3">
              <div>
                <h2 className="text-sm font-serif font-semibold tracking-tight text-charcoal">CV Full Preview</h2>
                <p className="text-xs text-warm-gray">Focused reading mode with the surrounding dashboard hidden.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowFullPreview(false)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-cream-200 bg-white text-warm-gray transition-colors hover:border-navy-200 hover:text-navy-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-auto bg-cream-100 p-4 sm:p-6">
              <div className="mx-auto w-fit bg-white shadow-md">
                <CVTemplateRenderer data={previewCVData} templateId={selectedTemplateId} />
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
