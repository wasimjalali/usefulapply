import type { ReactNode } from 'react';

/**
 * A small renderToStaticMarkup for the export pages.
 *
 * Why it exists: Next compiles route handlers in the React Server Components
 * layer, where every `react-dom/server` entry point resolves to a module that
 * throws, so the real one cannot be imported next to the templates. The
 * templates are plain function components with inline styles, no hooks, so
 * walking the element tree is enough. The eval renders every template with
 * both this and react-dom/server and compares the HTML, so the two cannot drift
 * apart unnoticed (evals/ats-export/markup-parity.ts).
 */

const VOID_ELEMENTS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);

/** CSS properties React leaves unitless when given a number. */
const UNITLESS = new Set([
  'animationIterationCount', 'aspectRatio', 'borderImageOutset', 'borderImageSlice', 'borderImageWidth', 'boxFlex', 'boxFlexGroup',
  'boxOrdinalGroup', 'columnCount', 'columns', 'flex', 'flexGrow', 'flexPositive', 'flexShrink', 'flexNegative', 'flexOrder',
  'gridArea', 'gridRow', 'gridRowEnd', 'gridRowSpan', 'gridRowStart', 'gridColumn', 'gridColumnEnd', 'gridColumnSpan',
  'gridColumnStart', 'fontWeight', 'lineClamp', 'lineHeight', 'opacity', 'order', 'orphans', 'scale', 'tabSize', 'widows',
  'zIndex', 'zoom', 'fillOpacity', 'floodOpacity', 'stopOpacity', 'strokeDasharray', 'strokeDashoffset', 'strokeMiterlimit',
  'strokeOpacity', 'strokeWidth',
]);

/** React prop names whose HTML or SVG attribute is spelled differently. */
const ATTRIBUTE_NAMES: Record<string, string> = {
  className: 'class',
  htmlFor: 'for',
  tabIndex: 'tabindex',
  strokeWidth: 'stroke-width',
  strokeLinecap: 'stroke-linecap',
  strokeLinejoin: 'stroke-linejoin',
  strokeDasharray: 'stroke-dasharray',
  strokeDashoffset: 'stroke-dashoffset',
  strokeMiterlimit: 'stroke-miterlimit',
  strokeOpacity: 'stroke-opacity',
  fillRule: 'fill-rule',
  fillOpacity: 'fill-opacity',
  clipRule: 'clip-rule',
  clipPath: 'clip-path',
  fontFamily: 'font-family',
  fontSize: 'font-size',
  textAnchor: 'text-anchor',
  stopColor: 'stop-color',
  stopOpacity: 'stop-opacity',
  xlinkHref: 'xlink:href',
  crossOrigin: 'crossorigin',
  colSpan: 'colspan',
  rowSpan: 'rowspan',
};

const SKIPPED_PROPS = new Set(['children', 'key', 'ref', 'dangerouslySetInnerHTML', 'suppressHydrationWarning', 'suppressContentEditableWarning']);

const FRAGMENT = Symbol.for('react.fragment');
const FORWARD_REF = Symbol.for('react.forward_ref');
const MEMO = Symbol.for('react.memo');

type ElementLike = { type: unknown; props: Record<string, unknown> };

function isElement(node: unknown): node is ElementLike {
  return typeof node === 'object' && node !== null && 'type' in node && 'props' in node && '$$typeof' in node;
}

export function escapeText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttribute(value: string): string {
  return escapeText(value).replace(/"/g, '&quot;');
}

function kebab(name: string): string {
  if (name.startsWith('--')) return name;
  const prefixed = name.startsWith('Webkit') || name.startsWith('Moz') || name.startsWith('ms') ? `-${name.charAt(0).toLowerCase()}${name.slice(1)}` : name;
  return prefixed.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

function styleString(style: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [name, raw] of Object.entries(style)) {
    if (raw === null || raw === undefined || typeof raw === 'boolean' || raw === '') continue;
    let value: string;
    if (typeof raw === 'number') value = raw === 0 || UNITLESS.has(name) ? String(raw) : `${raw}px`;
    else value = String(raw).trim();
    parts.push(`${kebab(name)}:${value}`);
  }
  return parts.join(';');
}

function attributes(props: Record<string, unknown>): string {
  let out = '';
  for (const [name, value] of Object.entries(props)) {
    if (SKIPPED_PROPS.has(name) || value === null || value === undefined || value === false || typeof value === 'function') continue;
    if (name === 'style') {
      const css = styleString(value as Record<string, unknown>);
      if (css) out += ` style="${escapeAttribute(css)}"`;
      continue;
    }
    const attr = ATTRIBUTE_NAMES[name] ?? name;
    if (value === true) out += attr.startsWith('aria-') || attr.startsWith('data-') ? ` ${attr}="true"` : ` ${attr}=""`;
    else out += ` ${attr}="${escapeAttribute(String(value))}"`;
  }
  return out;
}

function renderChildren(children: unknown): string {
  if (Array.isArray(children)) return children.map(renderChildren).join('');
  return render(children as ReactNode);
}

function render(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string') return escapeText(node);
  if (typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(render).join('');
  if (!isElement(node)) return '';

  const { type, props } = node;
  if (type === FRAGMENT) return renderChildren(props.children);
  if (typeof type === 'function') return render((type as (p: Record<string, unknown>) => ReactNode)(props));
  if (typeof type === 'object' && type !== null) {
    const tagged = type as { $$typeof?: symbol; render?: (p: Record<string, unknown>, ref: null) => ReactNode; type?: unknown };
    if (tagged.$$typeof === FORWARD_REF && tagged.render) return render(tagged.render(props, null));
    if (tagged.$$typeof === MEMO && tagged.type) return render({ ...(node as object), type: tagged.type } as unknown as ReactNode);
    throw new Error('static-markup: unsupported component type');
  }
  if (typeof type !== 'string') throw new Error('static-markup: unsupported element type');

  const open = `<${type}${attributes(props)}>`;
  if (VOID_ELEMENTS.has(type)) return open;
  return `${open}${renderChildren(props.children)}</${type}>`;
}

export function renderToStaticMarkup(node: ReactNode): string {
  return render(node);
}
