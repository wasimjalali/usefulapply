// Flow 3: the Job Feed inside the chat spine. Variants first. Run: node gen4.mjs
import { writeFileSync } from 'node:fs';
import { I, stages, progress, wrap, frame } from '../flow-1-artboards/lib.mjs';
import { EXTRA as EX0, sidebar, convoHeader, assistant, userMsg, composer } from '../flow-1-artboards/final/spine.mjs';

const EXTRA = { ...EX0,
  back: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 19-7-7 7-7M19 12H5"></path></svg>',
  pin: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>',
  globe: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M2 12h20M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20z"></path></svg>',
  dollar: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>',
  clock: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M12 6v6l4 2"></path></svg>',
  bookmark: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m19 21-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path></svg>',
  ext: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><path d="M15 3h6v6M10 14 21 3"></path></svg>',
  sliders: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"></path></svg>',
  refresh: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 1-15.5 6.3L3 16M3 12a9 9 0 0 1 15.5-6.3L21 8"></path><path d="M21 3v5h-5M3 21v-5h5"></path></svg>',
};

const APPS = [['Pixellot', 'Product Manager, B2B Platform', 'draft', 'Kit ready'], ['TeamSnap', 'Senior Product Manager', 'applied', 'Applied']];
const side = (o = {}) => sidebar({ apps: APPS, active: -1, plan: 'Plus plan', credits: '41 of 50 credits', pct: 82, feedActive: true, feedCount: 20, ...o });

const JOBS = [
  { m: 'Strong match', mc: '#3A5A4C', t: 'Product Manager, B2B SaaS', c: 'Avetta', loc: 'Remote, US', mode: 'Remote', sal: '$87.5K to $180K', age: '3 days ago', s: 'Avetta is building the largest global community of hiring clients and suppliers. You\'ll own the roadmap for the supplier-risk platform used by 500+ enterprise customers.' },
  { m: 'Strong match', mc: '#3A5A4C', t: 'Senior Product Manager, Integrations', c: 'Zapier', loc: 'Remote, US', mode: 'Remote', sal: '$170K to $210K', age: '1 day ago', s: 'Own the partner-integration platform: REST APIs, webhooks and the developer experience for 7,000+ connected apps.' },
  { m: 'Good match', mc: '#A37824', t: 'Product Manager, Platform', c: 'Pixellot', loc: 'Remote, US', mode: 'Remote', sal: '$140K to $165K', age: '2 days ago', s: 'Own the B2B admin platform and partner integrations for broadcasters, leagues and media companies.' },
  { m: 'Good match', mc: '#A37824', t: 'Product Manager, Data Products', c: 'Mixpanel', loc: 'San Francisco, US', mode: 'Hybrid', sal: '$150K to $190K', age: '4 days ago', s: 'Lead the analytics product surface used by 8,000 customers. SQL fluency and experimentation background expected.' },
  { m: 'Good match', mc: '#A37824', t: 'Product Manager, Partner Platform', c: 'HubSpot', loc: 'Remote, US', mode: 'Remote', sal: '$145K to $175K', age: '1 day ago', s: 'Own the app marketplace and partner APIs. Experience shipping integrations used by thousands of customers.' },
  { m: 'Good match', mc: '#A37824', t: 'Group Product Manager, Growth', c: 'Calendly', loc: 'Remote, US', mode: 'Remote', sal: '$185K to $230K', age: '5 days ago', s: 'Lead a pod of three PMs across activation and onboarding. Strong data-driven prioritisation record required.' },
];

const badge = (j) => `<span style="display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600; color: ${j.mc}"><span style="display: inline-block; width: 7px; height: 7px; border-radius: 9999px; background: ${j.mc}"></span>${j.m}</span>`;
const meta = (j) => `<div style="display: flex; flex-wrap: wrap; gap: 6px">${[[EXTRA.pin, j.loc], [EXTRA.globe, j.mode], [EXTRA.dollar, j.sal], [EXTRA.clock, j.age]].map(([ic, t], i) => `<span style="display: inline-flex; align-items: center; gap: 5px; height: 26px; padding: 0 9px; border-radius: 9999px; border: 1px solid #F5F0E8; background: ${i === 2 ? '#EEF4F1' : '#FEFDFB'}; color: ${i === 2 ? '#3A5A4C' : '#2D3748'}; font-size: 12px; font-weight: 500">${ic}${t}</span>`).join('')}</div>`;

// Card variant A: one gold action, detail on click
function cardA(j, { selected = false, compact = false } = {}) {
  return `<div class="card" style="padding: 16px 18px; display: flex; gap: 16px; background: #FFFFFF; ${selected ? 'border-color: #EBDAAE; box-shadow: 0 0 0 1px #EBDAAE, 0 1px 2px 0 rgb(30 58 95 / 0.06)' : ''}">
    <div style="display: flex; flex-direction: column; gap: 8px; flex: 1; min-width: 0">
      ${badge(j)}
      <div style="display: flex; flex-direction: column; gap: 2px"><span style="font-size: 16px; font-weight: 600; color: #182F4D">${j.t}</span><span class="muted" style="font-size: 13px">${j.c}</span></div>
      ${meta(j)}
      ${compact ? '' : `<span class="muted" style="font-size: 13px; line-height: 1.5; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden">${j.s}</span><span style="font-size: 12.5px; font-weight: 600; color: #1E3A5F; display: inline-flex; align-items: center; gap: 4px">Details ${I.arrow}</span>`}
    </div>
    <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 8px; flex-shrink: 0">
      <span class="btn-gold" style="height: 38px; padding: 0 14px; font-size: 13px">${I.search}Check fit <span class="cost">· 0.5</span></span>
      <div style="display: flex; gap: 4px"><span class="muted" style="display: inline-flex; width: 34px; height: 34px; border-radius: 9999px; align-items: center; justify-content: center">${EXTRA.bookmark}</span><span class="muted" style="display: inline-flex; width: 34px; height: 34px; border-radius: 9999px; align-items: center; justify-content: center">${EXTRA.ext}</span></div>
    </div>
  </div>`;
}
// Card variant B: two buttons like today, re-styled with prices
function cardB(j) {
  return `<div class="card" style="padding: 16px 18px; display: flex; gap: 16px; background: #FFFFFF">
    <div style="display: flex; flex-direction: column; gap: 8px; flex: 1; min-width: 0">
      ${badge(j)}
      <div style="display: flex; flex-direction: column; gap: 2px"><span style="font-size: 16px; font-weight: 600; color: #182F4D">${j.t}</span><span class="muted" style="font-size: 13px">${j.c}</span></div>
      ${meta(j)}
      <span class="muted" style="font-size: 13px; line-height: 1.5; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden">${j.s}</span>
    </div>
    <div style="display: flex; flex-direction: column; gap: 8px; flex-shrink: 0; width: 170px">
      <span class="btn-gold" style="height: 38px; font-size: 13px">${I.spark}Generate kit <span class="cost">· 2</span></span>
      <span class="btn-ghost" style="height: 38px; font-size: 13px">${I.search}Check fit <span class="cost">· 0.5</span></span>
      <div style="display: flex; justify-content: space-between; font-size: 12px; font-weight: 500; color: #1E3A5F; padding: 0 4px"><span>Employer site</span><span>Details</span></div>
    </div>
  </div>`;
}

// Feed canvas header
function feedHeader({ title = '20 new roles today', sub = 'Ranked for Product, Senior, B2B SaaS · United States · refreshed 09:25', editOn = false } = {}) {
  return `<div style="display: flex; align-items: center; gap: 12px; padding: 16px 20px 12px 20px; border-bottom: 1px solid #F5F0E8">
    <div style="display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0"><span class="serif" style="font-size: 20px; color: #182F4D">${title}</span><span class="muted" style="font-size: 12.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis">${sub}</span></div>
    <div class="pillgroup"><span class="tab on">Today</span><span class="tab">Saved</span></div>
    <span class="tool" style="${editOn ? 'background: #FFFFFF; border-color: #EBDAAE' : ''}">${EXTRA.sliders}Edit feed</span>
  </div>`;
}
const canvasShell = (inner, extra = '') => `<div style="flex: 1; display: flex; flex-direction: column; min-width: 0; background: #FAF7F2; ${extra}">${inner}</div>`;
const list = (cards) => `<div style="flex: 1; overflow: hidden; display: flex; flex-direction: column; gap: 10px; padding: 16px 20px 0 20px">${cards.join('')}</div>`;

// Feed conversation
const feedConvo = (tail, placeholder = 'Tell me what to change, e.g. "more remote, no agencies"') => `${convoHeader("Today's feed", 'Wednesday 19 August · 20 new roles')}
  <div style="flex: 1; display: flex; flex-direction: column; gap: 22px; padding: 22px 20px; overflow: hidden">${tail}</div>
  ${composer(placeholder)}`;
const feedAnnounce = assistant(`<span>Good morning. I searched ten ways for you overnight and found <strong>20 new roles</strong>, two strong matches at the top: Avetta and Zapier, both remote, both API-heavy product roles. Two duplicates removed.</span>
  <div style="display: flex; flex-wrap: wrap; gap: 8px"><span class="chip secondary" style="height: 36px; padding: 0 14px; font-size: 13px">Why Avetta first?</span><span class="chip secondary" style="height: 36px; padding: 0 14px; font-size: 13px">Only remote</span><span class="chip secondary" style="height: 36px; padding: 0 14px; font-size: 13px">Raise my salary floor</span></div>`);

const spine3 = (sideHtml, convo, canvas, convoWidth = 520) => frame(`
  <div style="flex: 1; display: flex; min-height: 0">
    ${sideHtml}
    <div style="width: ${convoWidth}px; flex-shrink: 0; display: flex; flex-direction: column; border-right: 1px solid #F5F0E8; background: #FEFDFB">${convo}</div>
    ${canvas}
  </div>`);

// ---------------------------------------------------------------------------
// Row 1: feed layout variants
// ---------------------------------------------------------------------------
const FA = spine3(side(), feedConvo(`${feedAnnounce}${userMsg('Why Avetta first?')}${assistant('<span>Avetta asks for B2B SaaS ownership, supplier-side integrations and a data-driven roadmap. Your Zendesk and Salesforce connector work and the 22% churn result hit all three. Salary is in your range and it\'s remote. Zapier is a close second, it leans more on developer experience.</span>')}`),
  canvasShell(`${feedHeader()}${list(JOBS.slice(0, 4).map((j, i) => cardA(j, { selected: i === 0 })))}`));

// Cards inside the chat; canvas shows the selected job
const chatCard = (j, sel) => `<div class="card" style="padding: 12px 14px; display: flex; flex-direction: column; gap: 8px; background: #FFFFFF; ${sel ? 'border-color: #EBDAAE; box-shadow: 0 0 0 1px #EBDAAE' : ''}">
  ${badge(j)}<div style="display: flex; flex-direction: column; gap: 1px"><span style="font-size: 14px; font-weight: 600; color: #182F4D">${j.t}</span><span class="muted" style="font-size: 12.5px">${j.c} · ${j.loc} · ${j.sal}</span></div>
  <div style="display: flex; gap: 8px; align-items: center"><span class="btn-gold" style="height: 32px; padding: 0 12px; font-size: 12.5px">${I.search}Check fit · 0.5</span><span class="muted" style="font-size: 12.5px; font-weight: 500">Details</span></div>
</div>`;
const detailView = (j) => `<div style="flex: 1; display: flex; flex-direction: column; min-height: 0">
  <div style="display: flex; align-items: center; gap: 12px; padding: 10px 20px; border-bottom: 1px solid #F5F0E8"><span class="tool">${EXTRA.back}Back to feed</span><div style="flex: 1"></div><span class="muted" style="display: inline-flex; align-items: center; gap: 6px; font-size: 13px">${EXTRA.bookmark}Save</span><span class="muted" style="display: inline-flex; align-items: center; gap: 6px; font-size: 13px; margin-left: 12px">${EXTRA.ext}Employer site</span></div>
  <div style="flex: 1; overflow: hidden; padding: 24px 28px; display: flex; flex-direction: column; gap: 16px">
    ${badge(j)}
    <div style="display: flex; flex-direction: column; gap: 4px"><span class="serif" style="font-size: 24px; color: #182F4D">${j.t}</span><span class="muted" style="font-size: 14px">${j.c}</span></div>
    ${meta(j)}
    <div style="display: flex; align-items: center; gap: 16px; padding: 14px 0; border-top: 1px solid #F5F0E8; border-bottom: 1px solid #F5F0E8"><span class="btn-gold" style="height: 44px; padding: 0 18px; font-size: 14px">${I.search}Check fit <span class="cost">· 0.5 credits</span></span><span style="font-size: 13px; color: #1E3A5F; font-weight: 500">Skip the check, generate the kit (2 credits)</span></div>
    <div style="display: flex; flex-direction: column; gap: 8px"><span class="muted" style="font-size: 11px; font-weight: 600; letter-spacing: 0.08em">WHY IT'S A MATCH</span><span style="font-size: 14px; line-height: 1.55; color: #2D3748">B2B SaaS ownership, supplier-side integrations and a data-driven roadmap. Your Zendesk and Salesforce connector work and the 22% churn result hit all three. Gap: no compliance-industry background.</span></div>
    <div style="display: flex; flex-direction: column; gap: 8px"><span class="muted" style="font-size: 11px; font-weight: 600; letter-spacing: 0.08em">THE AD</span><span style="font-size: 14px; line-height: 1.6; color: #2D3748">${j.s} You'll partner with engineering, design and customer success, define the integration roadmap for our supplier network, and ship features that reduce onboarding time for enterprise buyers. Requirements: 5+ years in B2B SaaS product management, API product experience, strong analytical toolkit (SQL, Mixpanel or similar)...</span></div>
  </div>
</div>`;
const FB = spine3(side(), `${convoHeader("Today's feed", 'Wednesday 19 August · 20 new roles')}
  <div style="flex: 1; display: flex; flex-direction: column; gap: 16px; padding: 18px 20px; overflow: hidden">
    ${assistant(`<span>Good morning. 20 new roles, two strong matches on top. Here are the first five, say "more" for the rest.</span>`)}
    <div style="display: flex; flex-direction: column; gap: 8px; padding-left: 34px">${JOBS.slice(0, 3).map((j, i) => chatCard(j, i === 0)).join('')}</div>
  </div>
  ${composer('"More", "only remote", or ask about any role')}`,
  canvasShell(detailView(JOBS[0])));

// List only, chat collapsed to a rail
const FC = frame(`
  <div style="flex: 1; display: flex; min-height: 0">
    ${side()}
    <div style="width: 56px; flex-shrink: 0; display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 14px 0; border-right: 1px solid #F5F0E8; background: #FEFDFB">
      <span class="muted" style="display: inline-flex; width: 36px; height: 36px; border-radius: 9999px; align-items: center; justify-content: center; border: 1px solid #F5F0E8; background: #FFFFFF">${I.send}</span>
    </div>
    ${canvasShell(`${feedHeader()}
      <div style="flex: 1; overflow: hidden; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; padding: 16px 20px 0 20px; align-content: start">${JOBS.slice(0, 6).map((j) => cardA(j, { compact: false })).join('')}</div>`)}
  </div>`);

// ---------------------------------------------------------------------------
// Row 2: card variants (same layout A so only the card differs)
// ---------------------------------------------------------------------------
const CA = spine3(side(), feedConvo(feedAnnounce), canvasShell(`${feedHeader()}${list(JOBS.slice(0, 4).map((j) => cardA(j)))}`));
const CB = spine3(side(), feedConvo(feedAnnounce), canvasShell(`${feedHeader()}${list(JOBS.slice(0, 3).map((j) => cardB(j)))}`));

// ---------------------------------------------------------------------------
// Row 3: setup and edit variants
// ---------------------------------------------------------------------------
const chipRow = (items, picked = []) => `<div style="display: flex; flex-wrap: wrap; gap: 8px">${items.map((t) => `<span class="chip ${picked.includes(t) ? 'primary' : 'secondary'}" style="height: 36px; padding: 0 14px; font-size: 13px">${picked.includes(t) ? I.check : ''}${t}</span>`).join('')}</div>`;
// S-A: setup via chips in the feed conversation (first run, no feed yet)
const SA = spine3(side({ feedCount: 0 }), `${convoHeader("Today's feed", 'Not built yet')}
  <div style="flex: 1; display: flex; flex-direction: column; gap: 22px; padding: 22px 20px; overflow: hidden">
    ${assistant(`<span>I read your CV: Senior Product Manager, B2B SaaS, API and integrations. I'll search for roles like that every morning. Three quick things I can't guess from the CV.</span><span style="font-size: 13px; font-weight: 600; color: #182F4D">Where should I look?</span>${chipRow(['United States', 'Canada', 'United Kingdom', 'Germany', 'Anywhere remote'], ['United States'])}`)}
    ${userMsg('United States')}
    ${assistant(`<span style="font-size: 13px; font-weight: 600; color: #182F4D">How do you want to work?</span>${chipRow(['Remote only', 'Remote first', 'Hybrid okay', 'On-site okay'], ['Remote first'])}`)}
    ${userMsg('Remote first')}
    ${assistant(`<span style="font-size: 13px; font-weight: 600; color: #182F4D">Minimum salary, or skip?</span>${chipRow(['$120K', '$150K', '$180K', 'Skip'])}`)}
  </div>
  ${composer('Or just type it: "US and Canada, remote, 150K+"')}`,
  canvasShell(`<div style="flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; padding: 40px">
    <span style="display: inline-flex; width: 56px; height: 56px; border-radius: 9999px; background: #F5ECD5; color: #A37824; align-items: center; justify-content: center">${I.briefcase}</span>
    <span class="serif" style="font-size: 20px; color: #182F4D">Your feed lands here</span>
    <span class="muted" style="font-size: 14px; text-align: center; max-width: 380px">Answer the three questions on the left and I'll build it. About a minute. After that it refreshes every morning on its own.</span>
  </div>`));
// S-B: setup as a form in the canvas
const field = (label, inner) => `<div style="display: flex; flex-direction: column; gap: 8px"><span style="font-size: 12px; font-weight: 600; letter-spacing: 0.06em; color: #2D3748">${label}</span>${inner}</div>`;
const input = (t, w = '100%') => `<div style="height: 44px; width: ${w}; box-sizing: border-box; border: 1px solid #F5F0E8; border-radius: 12px; background: #FFFFFF; padding: 0 14px; display: flex; align-items: center; font-size: 14px; color: #2D3748">${t}</div>`;
const SB = spine3(side({ feedCount: 0 }), `${convoHeader("Today's feed", 'Not built yet')}
  <div style="flex: 1; display: flex; flex-direction: column; gap: 22px; padding: 22px 20px; overflow: hidden">
    ${assistant(`<span>Fill in the three things on the right that I can't guess from your CV, then I'll build your first feed.</span>`)}
  </div>
  ${composer('Ask anything about the feed')}`,
  canvasShell(`<div style="flex: 1; overflow: hidden; display: flex; flex-direction: column; align-items: center; padding: 36px 0 0 0">
    <div class="card" style="width: 560px; padding: 28px; display: flex; flex-direction: column; gap: 22px; background: #FFFFFF">
      <span class="serif" style="font-size: 22px; color: #182F4D">Where do you want to work?</span>
      ${field('COUNTRIES', `${input('United States')}<div style="display: flex; gap: 6px"><span class="status now" style="height: 24px">United States ×</span></div>`)}
      ${field('CITIES (OPTIONAL)', input('Type a city and press Enter'))}
      ${field('HOW YOU WANT TO WORK', chipRow(['Remote first', 'Remote only', 'Hybrid okay', 'On-site okay'], ['Remote first']))}
      ${field('MINIMUM SALARY (OPTIONAL)', input('e.g. 150000', '220px'))}
      <span class="btn-gold" style="height: 48px; font-size: 15px">Build my feed</span>
    </div>
  </div>`));

// E-A: Edit feed as a canvas view with Back (profile, queries, preferences)
const queries = [['Senior Product Manager B2B SaaS', 'Your most recent title plus the market you\'ve shipped in.'], ['Product Manager API Integrations', 'Zendesk and Salesforce connector work is your strongest differentiator.'], ['Group Product Manager B2B SaaS', 'One step up. Your pod-lead experience supports it.'], ['Product Manager Data Analytics SaaS', 'Mixpanel, SQL and A/B testing appear across both roles.']];
const EA = spine3(side(), feedConvo(`${feedAnnounce}${userMsg('Open Edit feed')}${assistant('<span>It\'s on the right. Change anything there, or just tell me: "drop Group PM", "add Berlin", "no agencies".</span>')}`),
  canvasShell(`<div style="display: flex; align-items: center; gap: 12px; padding: 10px 20px; border-bottom: 1px solid #F5F0E8"><span class="tool">${EXTRA.back}Back to feed</span><span class="serif" style="font-size: 16px; color: #182F4D; margin-left: 6px">How I search for you</span><div style="flex: 1"></div><div class="pillgroup"><span class="tab on">Profile</span><span class="tab">Searches</span><span class="tab">Preferences</span></div></div>
    <div style="flex: 1; overflow: hidden; display: flex; flex-direction: column; gap: 12px; padding: 20px 20px 0 20px">
      <div class="card" style="padding: 18px; display: flex; flex-direction: column; gap: 14px; background: #FFFFFF">
        <div style="display: flex; align-items: center; gap: 10px"><span style="font-size: 14px; font-weight: 600; color: #182F4D">What I read from your CV</span><span class="muted" style="font-size: 12px">refreshed 19 Aug</span></div>
        <div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px">
          ${field('DISCIPLINE', '<span style="font-size: 14px">Product · Senior · 7+ years</span>')}
          ${field('INDUSTRIES', chipRow(['Enterprise SaaS', 'Data analytics']))}
        </div>
        ${field('BEST-FIT TITLES', chipRow(['Senior Product Manager', 'Product Manager, API and Integrations', 'Product Manager, B2B SaaS', 'Group Product Manager']))}
        ${field('STRONGEST SKILL AREAS', '<span style="font-size: 13.5px; line-height: 1.6; color: #2D3748"><strong>B2B SaaS product management:</strong> roadmap, backlog, OKRs, stakeholder alignment. <strong>Data-driven decisions:</strong> Mixpanel, SQL, A/B testing. <strong>API and integration ownership:</strong> REST APIs, Zendesk, B2B integrations.</span>')}
      </div>
      <div class="card" style="padding: 18px; display: flex; flex-direction: column; gap: 10px; background: #FFFFFF">
        <div style="display: flex; align-items: center; gap: 10px"><span style="font-size: 14px; font-weight: 600; color: #182F4D">The searches I run every morning</span><span class="muted" style="font-size: 12px">10, in priority order</span></div>
        ${queries.map(([q, why], i) => `<div style="display: flex; gap: 12px; align-items: flex-start; padding: 8px 0; border-top: 1px solid #F5F0E8"><span style="display: inline-flex; width: 22px; height: 22px; flex-shrink: 0; border-radius: 9999px; background: #F5ECD5; color: #825E1C; font-size: 11px; font-weight: 700; align-items: center; justify-content: center">${i + 1}</span><div style="display: flex; flex-direction: column; gap: 2px"><span style="font-size: 13.5px; font-weight: 600; color: #182F4D">${q}</span><span class="muted" style="font-size: 12.5px">${why}</span></div></div>`).join('')}
      </div>
    </div>`));
// E-B: Edit feed as today's long form, with a sticky Back
const EB = spine3(side(), feedConvo(feedAnnounce),
  canvasShell(`<div style="display: flex; align-items: center; gap: 12px; padding: 10px 20px; border-bottom: 1px solid #F5F0E8; background: #FEFDFB"><span class="tool">${EXTRA.back}Back to feed</span><span class="muted" style="font-size: 13px">Edit feed · scroll for profile, searches and preferences</span></div>
    <div style="flex: 1; overflow: hidden; display: flex; flex-direction: column; gap: 12px; padding: 20px 20px 0 20px">
      <div class="card" style="padding: 18px; display: flex; flex-direction: column; gap: 12px; background: #FFFFFF">
        <span class="serif" style="font-size: 18px; color: #182F4D">Your AI search profile</span>
        ${field('DISCIPLINE', '<span style="font-size: 14px">Product · Senior · 7+ years</span>')}
        ${field('BEST-FIT TITLES', chipRow(['Senior Product Manager', 'Product Manager, API and Integrations', 'Product Manager, B2B SaaS', 'Group Product Manager']))}
        ${field('SUMMARY', '<span style="font-size: 13.5px; line-height: 1.6; color: #2D3748">Senior Product Manager with 7 years focused on B2B SaaS, API-integrated products and analytics-driven roadmaps. Owns a 12,000+ MAU analytics dashboard, managing a cross-functional pod while driving a 22% churn reduction and 38% adoption lift...</span>')}
      </div>
      <div class="card" style="padding: 18px; display: flex; flex-direction: column; gap: 12px; background: #FFFFFF">
        <span class="serif" style="font-size: 18px; color: #182F4D">How we'll search for you</span>
        ${queries.slice(0, 2).map(([q, why], i) => `<div style="display: flex; gap: 12px; align-items: flex-start"><span style="display: inline-flex; width: 22px; height: 22px; flex-shrink: 0; border-radius: 9999px; background: #F5ECD5; color: #825E1C; font-size: 11px; font-weight: 700; align-items: center; justify-content: center">${i + 1}</span><div style="display: flex; flex-direction: column; gap: 2px"><span style="font-size: 13.5px; font-weight: 600; color: #182F4D">${q}</span><span class="muted" style="font-size: 12.5px">${why}</span></div></div>`).join('')}
        <span class="muted" style="font-size: 12.5px">+ 8 more, then preferences below...</span>
      </div>
    </div>`));

const out = {
  'Main.dc.html': FA,
  'FB-Cards-In-Chat.dc.html': FB,
  'FC-List-Only.dc.html': FC,
  'CA-Card-One-Action.dc.html': CA,
  'CB-Card-Two-Buttons.dc.html': CB,
  'SA-Setup-Chips.dc.html': SA,
  'SB-Setup-Form.dc.html': SB,
  'EA-Edit-Canvas-View.dc.html': EA,
  'EB-Edit-Long-Form.dc.html': EB,
};
if (process.argv[1] && process.argv[1].endsWith('gen4.mjs')) {
  for (const [name, body] of Object.entries(out)) writeFileSync(name, wrap(body));
  console.log('wrote', Object.keys(out).join(', '));
}
export { EXTRA, APPS, side, JOBS, badge, meta, cardA, feedHeader, canvasShell, list, feedConvo, feedAnnounce, spine3, chatCard, detailView, chipRow, field, input, queries, SA, EA };
