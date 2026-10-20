/**
 * The stylesheet every exported page carries. It replaces what the app gets
 * from Tailwind's preflight (the templates were drawn against it), and adds the
 * print rules: page breaks, colour fidelity and no ligatures, which keeps
 * "fi" and "fl" as two letters in the text layer.
 *
 * There is no dependency on Tailwind classes at all: the exported page is a
 * standalone document with everything inlined.
 */

export const PRINT_BASE_CSS = `
*,::before,::after{box-sizing:border-box;margin:0;padding:0;border:0 solid}
html{-webkit-text-size-adjust:100%;tab-size:4;line-height:1.5;font-variant-ligatures:none}
body{margin:0;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact;text-rendering:geometricPrecision}
h1,h2,h3,h4,h5,h6{font-size:inherit;font-weight:inherit}
a{color:inherit;text-decoration:inherit}
ol,ul,menu{list-style:none}
img,svg{display:block;vertical-align:middle}
img{max-width:100%;height:auto}
strong,b{font-weight:700}
.cv-template{font-variant-ligatures:none}
.cv-entry{break-inside:avoid}
.cv-exp{break-inside:auto}
h1,h2,h3,h4{break-after:avoid}
/* An experience entry: title and employer stay with its first two bullets and its last two stay together.
   Entries of three bullets or fewer are kept whole. Nothing else is kept together: a block that can be
   longer than the space left must be allowed to split. */
.cv-entry-head{break-after:avoid}
.cv-bullets>.cv-bullet:first-child{break-after:avoid}
.cv-bullets>.cv-bullet:nth-last-child(2){break-after:avoid}
.cv-bullets-short>.cv-bullet{break-after:avoid}
.cv-bullets-short>.cv-bullet:last-child{break-after:auto}
p,li,.cv-bullet{orphans:2;widows:2}
`.trim();
