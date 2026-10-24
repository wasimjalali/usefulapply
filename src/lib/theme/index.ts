/**
 * The appearance setting: System, Light or Dark, kept in a cookie (read before first paint) and in localStorage
 * (read by other tabs). Only the app follows it. Marketing, auth and legal pages stay light: they are designed on
 * cream and read better that way. `:root[data-theme]` in globals.css carries the values.
 */

export type ThemePreference = 'system' | 'light' | 'dark';

export const THEME_COOKIE = 'ua-theme';
export const THEME_STORAGE_KEY = 'ua-theme';
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/** Routes that follow the setting. Everything else renders light. */
export const THEMED_PATH_PREFIXES = [
  '/dashboard',
  '/settings',
  '/profile',
  '/account',
  '/subscription',
  '/notifications',
  '/master-cv',
  '/admin-dashboard',
] as const;

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'system' || value === 'light' || value === 'dark';
}

export function isThemedPath(pathname: string): boolean {
  return THEMED_PATH_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/** The `data-theme` value for a page, or null to let the system setting decide (no attribute). */
export function themeAttribute(preference: ThemePreference, pathname: string): 'light' | 'dark' | null {
  if (!isThemedPath(pathname)) return 'light';
  return preference === 'system' ? null : preference;
}

export function applyTheme(preference: ThemePreference, pathname: string): void {
  const attribute = themeAttribute(preference, pathname);
  const root = document.documentElement;
  if (attribute) root.setAttribute('data-theme', attribute);
  else root.removeAttribute('data-theme');
}

export function readThemePreference(): ThemePreference {
  const fromCookie = document.cookie.split('; ').find((part) => part.startsWith(`${THEME_COOKIE}=`))?.slice(THEME_COOKIE.length + 1);
  if (isThemePreference(fromCookie)) return fromCookie;
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (isThemePreference(stored)) return stored;
  } catch {
    // Storage can be blocked (private mode, site data off); the cookie is the source of truth anyway.
  }
  return 'system';
}

export function saveThemePreference(preference: ThemePreference): void {
  document.cookie = `${THEME_COOKIE}=${preference}; path=/; max-age=${ONE_YEAR_SECONDS}; samesite=lax`;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // See readThemePreference: the cookie alone is enough.
  }
  applyTheme(preference, window.location.pathname);
  window.dispatchEvent(new CustomEvent('ua-theme-change', { detail: preference }));
}

/**
 * Inline script for the root layout's <head>: sets data-theme before the first paint, so a dark page never flashes
 * light. It repeats the logic above in plain ES5, because it runs before any bundle loads.
 */
export const THEME_BOOT_SCRIPT = `(function(){try{
var p='system',m=document.cookie.match(/(?:^|; )${THEME_COOKIE}=(system|light|dark)/);
if(m){p=m[1]}else{try{var s=localStorage.getItem('${THEME_STORAGE_KEY}');if(s==='light'||s==='dark'||s==='system')p=s}catch(e){}}
var path=location.pathname,pre=${JSON.stringify(THEMED_PATH_PREFIXES)},themed=false;
for(var i=0;i<pre.length;i++){if(path===pre[i]||path.indexOf(pre[i]+'/')===0){themed=true;break}}
var a=themed?(p==='system'?null:p):'light',r=document.documentElement;
if(a)r.setAttribute('data-theme',a);else r.removeAttribute('data-theme');
}catch(e){}})();`;
