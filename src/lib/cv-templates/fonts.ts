/**
 * Arimo and Gelasio (SIL OFL 1.1): metric-compatible with Arial and Georgia and
 * self-hosted in public/fonts. The canvas and the PDF export load the same
 * files, so a line breaks in the same place on screen and in the document.
 * Licenses sit beside the files (public/fonts/OFL-*.txt).
 */

export type FontFamily = 'Arimo' | 'Gelasio';
export type FontSubset = 'latin' | 'latin-ext';

export interface FontFaceSpec {
  family: FontFamily;
  subset: FontSubset;
  weight: 400 | 700;
  style: 'normal' | 'italic';
  file: string;
}

const UNICODE_RANGE: Record<FontSubset, string> = {
  latin:
    'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD',
  'latin-ext':
    'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF',
};

export const FONT_FACES: FontFaceSpec[] = (['Arimo', 'Gelasio'] as const).flatMap((family) =>
  (['latin', 'latin-ext'] as const).flatMap((subset) =>
    ([400, 700] as const).flatMap((weight) =>
      (['normal', 'italic'] as const).map((style) => ({
        family,
        subset,
        weight,
        style,
        file: `${family.toLowerCase()}-${subset}-${weight}-${style}.woff2`,
      })),
    ),
  ),
);

function faceCss(face: FontFaceSpec, src: string): string {
  return `@font-face{font-family:'${face.family}';font-style:${face.style};font-weight:${face.weight};font-display:swap;src:${src} format('woff2');unicode-range:${UNICODE_RANGE[face.subset]}}`;
}

/** Stylesheet for the web app. The browser fetches only the subsets a page uses. */
export function fontFaceCssFromUrls(baseUrl = '/fonts/'): string {
  return FONT_FACES.map((face) => faceCss(face, `url(${baseUrl}${face.file})`)).join('\n');
}

/** Anything outside the latin subset needs the latin-ext files too. */
export function needsLatinExt(text: string): boolean {
  return /[^\u0000-ÿıŒœʻʼˆ˚˜̩̄̈ -⁯€™↑↓−∕﻿�]/.test(text);
}

export type FontFileLoader = (file: string) => Promise<Uint8Array>;

/** Stylesheet for the export: fonts inlined as base64 so the page needs no network at all. */
export async function fontFaceCssInline(load: FontFileLoader, text: string): Promise<string> {
  const subsets: FontSubset[] = needsLatinExt(text) ? ['latin', 'latin-ext'] : ['latin'];
  const rules = await Promise.all(
    FONT_FACES.filter((face) => subsets.includes(face.subset)).map(async (face) => {
      const bytes = await load(face.file);
      return faceCss(face, `url(data:font/woff2;base64,${bytesToBase64(bytes)})`);
    }),
  );
  return rules.join('\n');
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
