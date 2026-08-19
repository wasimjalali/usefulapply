// Flow 7: the marketing site (landing and header). Run: node gen9.mjs
// Locked 19 Aug 2026: Main is the landing (Option A hero on the current aurora background, three product
// moments, founder note, the in-app plan cards, then the current final band and footer unchanged).
// Option B (drop-zone hero) and the variant-round pricing page live in the canvas version history.
// Images are the downsampled flow PNGs beside this file.
import { writeFileSync } from 'node:fs';
import { I, wordmark, wrap } from '../flow-1-artboards/lib.mjs';
import { EXTRA } from '../flow-1-artboards/final/spine.mjs';

const W = 1440, COL = 1040, X = (W - COL) / 2;
const NAVY = '#182F4D', INK = '#2D3748', MUTED = '#6B7280', GOLD = '#C4932E', LINE = '#F5F0E8';

const page = (h, inner) => `<div style="width: ${W}px; height: ${h}px; display: flex; flex-direction: column; background: #FAF7F2; overflow: hidden">${inner}</div>`;
const col = (inner, extra = '') => `<div style="width: ${COL}px; margin: 0 auto; display: flex; flex-direction: column; ${extra}">${inner}</div>`;
const gold = (t, h = 48) => `<span class="btn-gold" style="height: ${h}px; padding: 0 22px; font-size: 15px">${t}</span>`;
const ghost = (t, h = 48) => `<span class="btn-ghost" style="height: ${h}px; padding: 0 22px; font-size: 15px">${t}</span>`;
const textLink = (t) => `<span style="font-size: 14px; font-weight: 500; color: #1E3A5F">${t}</span>`;
const h1 = (t) => `<span class="serif" style="font-size: 56px; line-height: 1.08; letter-spacing: -0.01em; color: ${NAVY}; text-align: center; text-wrap: balance">${t}</span>`;
const h2 = (t) => `<span class="serif" style="font-size: 34px; line-height: 1.15; color: ${NAVY}">${t}</span>`;
const p = (t, size = 17) => `<span style="font-size: ${size}px; line-height: 1.55; color: ${INK}">${t}</span>`;
const shot = (src, w, extra = '') => `<img src="${src}" style="width: ${w}px; height: auto; display: block; border-radius: 16px; border: 1px solid ${LINE}; box-shadow: 0 1px 0 0 rgb(30 58 95 / 0.04), 0 10px 24px -12px rgb(30 58 95 / 0.16); ${extra}">`;

// Header: wordmark, Pricing, then Log in + gold Try it free (anonymous) or Open app (signed in).
function header({ signedIn = false, active = '', cta = true } = {}) {
  const nav = (t) => `<span style="font-size: 14px; font-weight: ${active === t ? 600 : 500}; color: ${active === t ? NAVY : '#1E3A5F'}; padding: 0 10px">${t}</span>`;
  const right = signedIn
    ? `<span class="btn-ghost" style="height: 40px; padding: 0 18px; font-size: 14px">Open app ${I.arrow}</span>`
    : `${textLink('Log in')}${cta ? `<span class="btn-gold" style="height: 40px; padding: 0 18px; font-size: 14px">Try it free</span>` : ''}`;
  return `<div style="display: flex; align-items: center; gap: 12px; height: 64px; padding: 0 ${X}px; background: #FEFDFB; border-bottom: 1px solid ${LINE}; flex-shrink: 0">${wordmark}<div style="flex: 1"></div>${nav('Pricing')}${right}</div>`;
}

// The current hero background (HeroAurora.tsx): navy, gold and sage orbs, a masked grid, a bottom fade.
const aurora = `<div style="position: absolute; inset: 0; overflow: hidden; pointer-events: none">
  <div style="position: absolute; top: -30%; left: -15%; width: 75%; height: 110%; background: radial-gradient(ellipse at center, rgba(30,58,95,0.38) 0%, rgba(30,58,95,0.14) 40%, transparent 70%); filter: blur(90px)"></div>
  <div style="position: absolute; bottom: -35%; right: -20%; width: 85%; height: 115%; background: radial-gradient(ellipse at center, rgba(212,168,83,0.45) 0%, rgba(212,168,83,0.16) 42%, transparent 72%); filter: blur(100px)"></div>
  <div style="position: absolute; top: 20%; right: -10%; width: 45%; height: 60%; background: radial-gradient(ellipse at center, rgba(91,138,114,0.22) 0%, rgba(91,138,114,0.08) 40%, transparent 70%); filter: blur(80px)"></div>
  <div style="position: absolute; inset: 0; background-image: linear-gradient(to right, rgba(30,58,95,0.11) 1px, transparent 1px), linear-gradient(to bottom, rgba(30,58,95,0.11) 1px, transparent 1px); background-size: 72px 72px; -webkit-mask-image: radial-gradient(ellipse 70% 60% at 50% 45%, transparent 30%, black 90%); mask-image: radial-gradient(ellipse 70% 60% at 50% 45%, transparent 30%, black 90%)"></div>
  <div style="position: absolute; left: 0; right: 0; bottom: 0; height: 128px; background: linear-gradient(to bottom, transparent, #FAF7F2)"></div>
</div>`;

// Hero A: one button into the guided line, the kit screen under it.
const heroA = `<div style="display: flex; flex-direction: column; align-items: center; gap: 22px; padding: 84px 0 0; position: relative">
  ${h1('Your entire job search, <span style="color: #C4932E">in one app.</span>')}
  <span style="font-size: 19px; line-height: 1.5; color: ${INK}; max-width: 640px; text-align: center">Upload your CV, paste a job, see your fit. Then a tailored CV, cover letter and emails in 90 seconds. Every word from your real CV, nothing invented.</span>
  <div style="display: flex; flex-direction: column; align-items: center; gap: 10px; margin-top: 6px">${gold('Try it free', 52)}<span class="muted" style="font-size: 13px">Your first fit check is on us, no account needed.</span></div>
  <div style="margin-top: 30px">${shot('kit.jpg', COL)}</div>
</div>`;

// Hero B: the landing is step 1 of the line. The drop zone is the CTA.
const dropZone = `<div class="card" style="width: 720px; padding: 28px; display: flex; flex-direction: column; gap: 18px; background: #FFFFFF">
  <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; height: 208px; border: 2px dashed #E0C687; border-radius: 16px; background: #FBF7EE">
    <span style="display: inline-flex; width: 52px; height: 52px; border-radius: 9999px; background: #FFFFFF; color: ${GOLD}; align-items: center; justify-content: center; box-shadow: 0 1px 2px 0 rgb(30 58 95 / 0.06)">${EXTRA.upload}</span>
    <span style="font-size: 15px; font-weight: 600; color: ${NAVY}">Drop your CV here</span>
    <span class="muted" style="font-size: 13px">PDF or Word, up to 10 MB</span>
    ${gold('Choose a file', 44)}
  </div>
  <span class="muted" style="font-size: 13px; text-align: center">Your first fit check is on us, no account needed. We read the file once and you can delete it any time.</span>
</div>`;
const heroB = `<div style="display: flex; flex-direction: column; align-items: center; gap: 22px; padding: 84px 0 0">
  ${h1('Start with your CV.<br>The rest takes 90 seconds.')}
  <span style="font-size: 19px; line-height: 1.5; color: ${INK}; max-width: 640px; text-align: center">Paste a job, see your fit, get a tailored CV, cover letter and emails. Every word from your real CV, nothing invented.</span>
  <div style="margin-top: 8px">${dropZone}</div>
  <div style="margin-top: 30px">${shot('kit.jpg', COL)}</div>
</div>`;

// Product moments: three rows, the new screens, one line each.
function moment({ title, body, img, flip = false }) {
  const text = `<div style="width: 320px; display: flex; flex-direction: column; gap: 12px; flex-shrink: 0">${h2(title)}${p(body, 16)}</div>`;
  const pic = shot(img, 680);
  return `<div style="display: flex; align-items: center; gap: 40px; ${flip ? 'flex-direction: row-reverse' : ''}">${text}${pic}</div>`;
}
const moments = `<div style="display: flex; flex-direction: column; gap: 72px; padding: 96px 0 0">
  ${moment({ title: 'See the fit before you spend anything', body: 'A score, what lines up, what\'s missing, and whether it\'s worth applying. The first check is free.', img: 'fit.jpg' })}
  ${moment({ title: 'A kit you can send, every claim from your CV', body: 'Tailored CV, cover letter, application email and follow-up. ATS-checked, with every change shown. Want it shorter? Just say so.', img: 'ats.jpg', flip: true })}
  ${moment({ title: 'Roles picked for you every morning', body: 'Five on Free, twenty on Plus. One click checks the fit, one more writes the kit, and the tracker fills itself.', img: 'feed.jpg' })}
</div>`;

// Founder note, short.
const founder = `<div style="display: flex; align-items: center; gap: 28px; padding: 96px 0 0">
  <img src="founder.jpg" style="width: 120px; height: 120px; border-radius: 16px; object-fit: cover; border: 1px solid ${LINE}; flex-shrink: 0">
  <div style="display: flex; flex-direction: column; gap: 10px">
    ${p('"I built Useful Apply for my own search. Sixty-plus applications, every one written by the product, five interviews, and the job I have now came from one of them."', 18)}
    <span class="muted" style="font-size: 14px">Wasim Jalali, founder</span>
  </div>
</div>`;

// Pricing cards: the same three cards as the settings modal (flow 5), with the marketing CTA on each.
function planCard(name, price, credits, lines, { highlight = false, cta } = {}) {
  const btn = cta[1] === 'gold' ? `<span class="btn-gold" style="height: 44px; font-size: 14px">${cta[0]}</span>` : `<span class="btn-ghost" style="height: 44px; font-size: 14px">${cta[0]}</span>`;
  return `<div style="flex: 1; display: flex; flex-direction: column; gap: 14px; padding: 24px; border-radius: 16px; background: ${highlight ? '#FBF7EE' : '#FFFFFF'}; border: 1px solid ${highlight ? '#EBDAAE' : LINE}; box-shadow: 0 1px 2px 0 rgb(30 58 95 / 0.06)">
    <div style="display: flex; align-items: baseline; gap: 8px"><span style="font-size: 16px; font-weight: 600; color: ${NAVY}">${name}</span>${highlight ? `<span style="font-size: 11px; font-weight: 600; letter-spacing: 0.08em; color: ${GOLD}">MOST POPULAR</span>` : ''}</div>
    <div style="display: flex; align-items: baseline; gap: 6px"><span class="serif" style="font-size: 34px; color: ${NAVY}">${price}</span><span class="muted" style="font-size: 14px">a month</span></div>
    <span style="font-size: 15px; font-weight: 600; color: ${INK}">${credits}</span>
    <div style="display: flex; flex-direction: column; gap: 8px; flex: 1">${lines.map((l) => `<span style="display: flex; align-items: center; gap: 8px; font-size: 14px; color: ${INK}"><span style="color: ${GOLD}; display: inline-flex">${I.check}</span>${l}</span>`).join('')}</div>
    ${btn}
  </div>`;
}
const cards = `<div style="display: flex; gap: 16px; width: 100%">
  ${planCard('Free', '$0', '4 credits a month', ['2 applications', 'Top-5 daily feed', 'Fit checks and the tracker'], { cta: ['Try it free', 'ghost'] })}
  ${planCard('Plus', '$19.99', '50 credits a month', ['25 applications', '20 roles a day, Edit feed', 'Everything in Free'], { highlight: true, cta: ['Start with Plus', 'gold'] })}
  ${planCard('Max', '$79.99', '200 credits a month', ['100 applications', 'Priority generation', 'Everything in Plus'], { cta: ['Go Max', 'ghost'] })}
</div>`;
const creditLine = `<span class="muted" style="font-size: 14px; text-align: center">Fit check 0.5 credit · full kit 2 (1.5 after a fit check) · rewrite 0.5. Need more? Add 50 credits for $19.99. Cancel any time.</span>`;
const pricingSection = `<div style="display: flex; flex-direction: column; gap: 28px; padding: 96px 0 0; align-items: center">
  ${h2('Start free. Pay when you\'re applying every week.')}
  ${cards}
  <span style="font-size: 14px; font-weight: 600; color: #1E3A5F; display: inline-flex; align-items: center; gap: 6px">Compare all plans and features ${I.arrow}</span>
</div>`;

// Final band and footer: the current ones (page.tsx final CTA, Footer.tsx), kept as they are.
const finalBand = `<div style="margin-top: 96px; padding: 96px 0; background: #182F4D; position: relative; overflow: hidden">
  <div style="position: absolute; inset: 0; background-image: radial-gradient(circle, rgba(30,58,95,0.07) 1px, transparent 1px); background-size: 24px 24px; opacity: 0.6"></div>
  <div style="position: relative; width: 760px; margin: 0 auto; display: flex; flex-direction: column; align-items: center; gap: 20px; text-align: center">
    <span style="font-size: 48px; line-height: 1.1; font-weight: 700; letter-spacing: -0.01em; color: #FFFFFF">Your next interview is <span style="color: #D4A853">90 seconds away.</span></span>
    <span style="font-size: 17px; line-height: 1.6; color: #C5D1E3; max-width: 600px">Upload your CV. Pick a role from your feed. Send your first full application before your coffee gets cold.</span>
    <div style="display: flex; gap: 12px; margin-top: 8px">
      <span style="display: inline-flex; align-items: center; gap: 8px; height: 50px; padding: 0 32px; border-radius: 8px; background: #D4A853; color: #FFFFFF; font-weight: 600; font-size: 16px">Start free, no credit card ${I.arrow}</span>
      <span style="display: inline-flex; align-items: center; height: 50px; padding: 0 32px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.3); color: #FFFFFF; font-weight: 600; font-size: 16px">View pricing</span>
    </div>
  </div>
</div>`;
const fcol = (title, links, accent = false) => `<div style="display: flex; flex-direction: column; gap: 12px; width: 190px"><span style="font-size: 11px; font-weight: 600; letter-spacing: 0.14em; color: #D4A853">${title}</span>${links.map((l) => `<span style="font-size: 14px; color: ${accent && l === links[links.length - 1] ? '#5EEAD4' : '#9FB3CF'}">${l}</span>`).join('')}</div>`;
const footer = `<div style="background: linear-gradient(to bottom, #1E3A5F, #12243B); border-top: 1px solid rgba(212,168,83,0.5); overflow: hidden">
  <div style="width: 1200px; margin: 0 auto; padding: 48px 0 0; display: flex; gap: 40px; align-items: flex-start">
    ${fcol('PRODUCT', ['What you get', 'Application Tracker', 'Pricing'])}
    ${fcol('RESOURCES', ['Useful Apply vs Rezi', 'Useful Apply vs Kickresume', 'Useful Apply vs Enhancv', 'Useful Apply vs Resume.io', 'Useful Apply vs Teal', 'Useful Apply vs Jobscan', 'All Comparisons', 'Try Free, No Sign-Up', 'Master CV Guide'])}
    ${fcol('BLOG', ['Your entire job search, in...', 'A smart job feed that read...', 'The screening question...', 'How to Tailor Your Resume...', 'What Is a Master CV and...', 'View All Posts'], true)}
    <div style="display: flex; flex-direction: column; gap: 40px">${fcol('COMPANY', ['About Us', 'Contact', 'Log In'])}${fcol('LEGAL', ['Privacy Policy', 'Terms of Service', 'Imprint'])}</div>
    <div style="display: flex; flex-direction: column; gap: 14px; width: 280px; margin-left: auto">
      <span style="font-size: 14px; line-height: 1.5; color: #FFFFFF">Find jobs. Write applications. Track progress. All in one app.</span>
      <span style="font-size: 14px; color: #9FB3CF">support@usefulapply.com</span>
      <span style="display: inline-flex; align-items: center; height: 36px; padding: 0 14px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.25); color: #FFFFFF; font-size: 14px; width: fit-content">Contact</span>
      <span style="display: inline-flex; align-items: center; gap: 8px; height: 34px; padding: 0 12px; border-radius: 8px; background: #FFFFFF; color: #182F4D; font-size: 13px; font-weight: 600; width: fit-content">Trustpilot <span style="color: #00B67A">★★★★★</span></span>
    </div>
  </div>
  <div style="display: flex; justify-content: center; padding: 72px 0 0; line-height: 0.8; overflow: hidden; height: 150px"><span style="font-family: 'Plus Jakarta Sans', Inter, system-ui, sans-serif; font-weight: 800; letter-spacing: -0.03em; font-size: 200px; color: #FFFFFF">Useful <span style="color: #D4A853">Apply</span></span></div>
</div>`;

const landing = (hero, h, hdr = {}) => page(h, `${header(hdr)}<div style="position: relative">${aurora}${col(`${hero}`)}</div>${col(`${moments}${founder}${pricingSection}`)}${finalBand}${footer}`);
const A = landing(heroA, 4432);
const B = landing(heroB, 3993, { cta: false }); // the drop zone is the one primary action, so the header keeps only Log in

// Pricing page: the same cards, one page, short.
const P = page(1007, `${header({ active: 'Pricing' })}${col(`
  <div style="display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 72px 0 0">
    ${h1('Every plan, every feature.<br>Pick your volume.')}
    <span class="muted" style="font-size: 16px">Start free. Upgrade when you\'re applying every week.</span>
  </div>
  <div style="display: flex; flex-direction: column; gap: 24px; padding: 44px 0 0; align-items: center">${cards}<span class="muted" style="font-size: 14px">Need more? Add 50 credits for $19.99. Cancel any time.</span></div>
  <div style="display: flex; flex-direction: column; gap: 16px; padding: 64px 0 0; align-items: center">
    <span style="font-size: 14px; font-weight: 600; letter-spacing: 0.06em; color: ${MUTED}">WHAT ONE APPLICATION COSTS</span>
    <div style="display: flex; gap: 12px">
      ${[['Fit check', '0.5'], ['Full kit after a fit check', '1.5'], ['Full kit straight away', '2'], ['Rewrite a cover letter or email', '0.5']].map(([a, b]) => `<div class="card" style="display: flex; flex-direction: column; gap: 6px; padding: 16px 20px; width: 200px"><span class="serif" style="font-size: 24px; color: ${NAVY}">${b}</span><span style="font-size: 13px; color: ${INK}">${a}</span></div>`).join('')}
    </div>
  </div>`)}${footer}`);

// Header states: anonymous, signed in (F10).
const H = page(236, `
  <div style="display: flex; flex-direction: column; gap: 28px; padding: 32px 0 0">
    <div style="display: flex; flex-direction: column; gap: 8px"><span class="muted" style="font-size: 12px; padding: 0 ${X}px">SIGNED OUT</span>${header()}</div>
    <div style="display: flex; flex-direction: column; gap: 8px"><span class="muted" style="font-size: 12px; padding: 0 ${X}px">SIGNED IN: Log in and Try it free become Open app</span>${header({ signedIn: true })}</div>
  </div>`);

const out = { 'Main.dc.html': A, 'Header.dc.html': H };
for (const [name, body] of Object.entries(out)) writeFileSync(name, wrap(body));
console.log('wrote', Object.keys(out).join(', '));
