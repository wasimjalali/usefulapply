// Assembles the six flow-1 artboards from shared partials so tokens and the
// header stay identical across options. Run: node gen.mjs

const CSS = `
  body { margin: 0; font-family: Inter, system-ui, -apple-system, 'Segoe UI', sans-serif; color: #2D3748; background: #FAF7F2; -webkit-font-smoothing: antialiased; }
  a { color: #1E3A5F; } a:hover { color: #182F4D; }
  .serif { font-family: Georgia, 'Times New Roman', serif; font-weight: 600; }
  .wm { font-family: 'Plus Jakarta Sans', Inter, system-ui, sans-serif; font-weight: 800; letter-spacing: -0.02em; font-size: 17px; line-height: 1; color: #0C1929; display: flex; align-items: center; white-space: nowrap; }
  .pillgroup { display: flex; align-items: center; gap: 2px; padding: 2px; border: 1px solid #F5F0E8; background: #FEFDFB; border-radius: 9999px; }
  .tab { display: flex; align-items: center; gap: 8px; padding: 6px 14px; border-radius: 9999px; font-size: 14px; font-weight: 500; color: #6B7280; white-space: nowrap; }
  .tab.on { background: #FFFFFF; color: #182F4D; font-weight: 600; box-shadow: 0 1px 2px 0 rgb(30 58 95 / 0.06), 0 1px 1px -1px rgb(30 58 95 / 0.05); }
  .btn-gold { display: inline-flex; align-items: center; justify-content: center; gap: 8px; background: #D4A853; color: #FFFFFF; font-weight: 600; border-radius: 9999px; white-space: nowrap; }
  .btn-navy { display: inline-flex; align-items: center; justify-content: center; gap: 8px; background: #1E3A5F; color: #FFFFFF; font-weight: 600; border-radius: 9999px; white-space: nowrap; }
  .btn-ghost { display: inline-flex; align-items: center; justify-content: center; gap: 8px; background: #FEFDFB; color: #182F4D; font-weight: 600; border: 1px solid #F5F0E8; border-radius: 9999px; white-space: nowrap; box-shadow: 0 1px 2px 0 rgb(30 58 95 / 0.06), 0 1px 1px -1px rgb(30 58 95 / 0.05); }
  .card { background: #FEFDFB; border: 1px solid #F5F0E8; border-radius: 16px; box-shadow: 0 1px 2px 0 rgb(30 58 95 / 0.06), 0 1px 1px -1px rgb(30 58 95 / 0.05); }
  .doc { background: #FFFFFF; border-radius: 16px; box-shadow: 0 1px 0 0 rgb(30 58 95 / 0.04), 0 10px 24px -12px rgb(30 58 95 / 0.16); }
  .muted { color: #6B7280; }
  .tool { display: inline-flex; align-items: center; gap: 8px; height: 36px; padding: 0 14px; border-radius: 9999px; background: #FEFDFB; border: 1px solid #F5F0E8; font-size: 14px; font-weight: 500; color: #2D3748; box-shadow: 0 1px 2px 0 rgb(30 58 95 / 0.06); white-space: nowrap; }
  .stage { display: flex; align-items: center; gap: 12px; padding: 12px 14px; border-radius: 12px; border: 1px solid #F5F0E8; background: #FEFDFB; }
  .stage.done { background: #FBF7EE; border-color: #EBDAAE; }
  .chip { display: inline-flex; align-items: center; gap: 8px; height: 44px; padding: 0 18px; border-radius: 9999px; font-size: 14px; font-weight: 600; white-space: nowrap; }
  .chip.primary { background: #D4A853; color: #FFFFFF; box-shadow: 0 0 0 1px rgb(212 168 83 / 0.18), 0 12px 30px -10px rgb(212 168 83 / 0.42); }
  .chip.secondary { background: #FEFDFB; color: #182F4D; border: 1px solid #F5F0E8; box-shadow: 0 1px 2px 0 rgb(30 58 95 / 0.06); }
  .cost { font-weight: 500; opacity: 0.85; }
  .status { display: inline-flex; align-items: center; height: 22px; padding: 0 9px; border-radius: 9999px; font-size: 11px; font-weight: 600; }
  .status.draft { background: #F5ECD5; color: #825E1C; }
  .status.applied { background: #EEF4F1; color: #3A5A4C; }
  .status.now { background: #E8EDF4; color: #182F4D; }
  .line { height: 1px; background: #F5F0E8; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .spin { animation: spin 1.1s linear infinite; transform-origin: 50% 50%; }
`;

// Lucide-style icons, 16px grid, stroke currentColor.
const I = {
  file: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><path d="M14 2v6h6"></path><path d="M8 13h8M8 17h8"></path></svg>',
  briefcase: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"></rect><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path></svg>',
  clipboard: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="2" width="8" height="4" rx="1"></rect><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path></svg>',
  mail: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"></rect><path d="m22 7-10 6L2 7"></path></svg>',
  send: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m22 2-7 20-4-9-9-4z"></path><path d="M22 2 11 13"></path></svg>',
  check: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"></path></svg>',
  spark: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3 1.9 5.6L19.5 10.5l-5.6 1.9L12 18l-1.9-5.6L4.5 10.5l5.6-1.9z"></path></svg>',
  search: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"></circle><path d="m21 21-4.3-4.3"></path></svg>',
  plus: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"></path></svg>',
  chev: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"></path></svg>',
  coin: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><path d="M12 7v10M9.5 9.5h3.75a1.75 1.75 0 0 1 0 3.5H10.5a1.75 1.75 0 0 0 0 3.5H14.5"></path></svg>',
  panel: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"></rect><path d="M15 4v16"></path></svg>',
  loader: '<svg class="spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M21 12a9 9 0 1 1-6.2-8.56"></path></svg>',
  user: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"></circle><path d="M4 21a8 8 0 0 1 16 0"></path></svg>',
  arrow: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7M8 7h9v9"></path></svg>',
  edit: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"></path></svg>',
  copy: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>',
  download: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><path d="m7 10 5 5 5-5M12 15V3"></path></svg>',
  layout: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"></rect><path d="M3 9h18M9 21V9"></path></svg>',
  history: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"></path><path d="M3 3v5h5"></path><path d="M12 7v5l3 2"></path></svg>',
};

const wordmark = `<span class="wm"><svg width="14" height="17" viewBox="0 0 84 100" aria-hidden="true" style="margin-right: 1px"><path d="M0 0 H24 V58 A18 18 0 0 0 60 58 V0 H62 L84 22 V58 A42 42 0 0 1 0 58 Z" fill="#0C1929"></path><path d="M62 0 V22 H84 Z" fill="#C4932E"></path></svg>seful&nbsp;<span style="color: #C4932E">Apply</span></span>`;

function creditChip(label, pct) {
  return `<div style="display: flex; align-items: center; gap: 10px; height: 44px; padding: 0 14px 0 10px; border-radius: 9999px; border: 1px solid #F5F0E8; background: #FEFDFB; box-shadow: 0 1px 2px 0 rgb(30 58 95 / 0.06)">
    <span style="display: inline-flex; width: 26px; height: 26px; border-radius: 9999px; background: #F5ECD5; color: #A37824; align-items: center; justify-content: center">${I.coin}</span>
    <div style="display: flex; flex-direction: column; gap: 4px">
      <span style="font-size: 13px; font-weight: 600; color: #2D3748; line-height: 1">${label}</span>
      <span style="display: block; width: 96px; height: 4px; border-radius: 9999px; background: #F5F0E8"><span style="display: block; width: ${pct}%; height: 4px; border-radius: 9999px; background: #D4A853"></span></span>
    </div>
    <span class="muted">${I.chev}</span>
  </div>`;
}

const avatar = `<div style="display: flex; align-items: center; gap: 6px; padding: 4px 6px; border-radius: 9999px; border: 1px solid #F5F0E8; background: #FEFDFB; box-shadow: 0 1px 2px 0 rgb(30 58 95 / 0.06)">
  <span style="position: relative; display: inline-flex; width: 30px; height: 30px; border-radius: 9999px; background: #1E3A5F; color: #FFFFFF; align-items: center; justify-content: center">${I.user}<span style="position: absolute; bottom: -5px; left: 50%; transform: translateX(-50%); font-size: 8px; font-weight: 700; padding: 2px 5px; border-radius: 9999px; background: #F5ECD5; color: #825E1C; line-height: 1">FREE</span></span>
  <span class="muted">${I.chev}</span>
</div>`;

// Header variants. tabs: true = current three-tab header. credits: label/pct.
function header({ tabs = true, credits = '4 credits', pct = 100, upgrade = true, panelToggle = true } = {}) {
  return `<div style="display: flex; align-items: center; gap: 12px; height: 52px; padding: 0 16px; background: #FEFDFB; border-bottom: 1px solid #F5F0E8; flex-shrink: 0">
    ${wordmark}
    ${tabs ? `<div class="pillgroup" style="margin-left: 8px">
      <span class="tab on"><span style="color: #C4932E">${I.file}</span>Application Kit</span>
      <span class="tab">${I.briefcase}Job Feed</span>
      <span class="tab">${I.clipboard}Tracker</span>
    </div>` : ''}
    <div style="flex: 1"></div>
    ${upgrade ? `<span class="btn-gold" style="height: 44px; padding: 0 16px; font-size: 14px">Upgrade to Plus ${I.arrow}</span>` : ''}
    ${creditChip(credits, pct)}
    ${panelToggle ? `<span class="muted" style="display: inline-flex; padding: 8px">${I.panel}</span>` : ''}
    ${avatar}
  </div>`;
}

// The CV document. Scaled to fit a panel of ~700px wide.
function cvDoc({ width = 620 } = {}) {
  return `<div class="doc" style="width: ${width}px; padding: 40px 56px 48px 56px; display: flex; flex-direction: column; gap: 14px; color: #1A2332">
    <div style="display: flex; flex-direction: column; gap: 6px">
      <div class="serif" style="font-size: 26px; color: #0C1929">Alex Morgan</div>
      <div class="serif" style="font-size: 13px; font-weight: 400; color: #1E3A5F">Product Manager | B2B SaaS | API &amp; Integration Products | Data-Driven Roadmaps</div>
      <div style="display: flex; gap: 14px; font-size: 9.5px; color: #4A5568; font-family: Arial, sans-serif">
        <span>alex.morgan@email.com</span><span>(415) 555-0182</span><span>San Francisco, US</span><span>LinkedIn</span><span>GitHub</span>
      </div>
      <div style="height: 2px; background: #1E3A5F; margin-top: 4px"></div>
    </div>
    <div style="display: flex; flex-direction: column; gap: 6px">
      <div class="serif" style="font-size: 11px; letter-spacing: 0.16em; color: #0C1929">PROFESSIONAL SUMMARY</div>
      <div style="height: 1px; background: #1E3A5F"></div>
      <div style="font-size: 9.5px; line-height: 1.55; color: #2D3748; font-family: Arial, sans-serif">Senior Product Manager with 6 years of experience leading cross-functional teams to deliver B2B SaaS and data-driven products. Proven ability to translate complex customer needs and technical capabilities into clear, prioritized product requirements, growing user engagement by 40% and reducing churn by 22% through iterative discovery and data-informed decisions. Experienced in managing Agile sprints, aligning stakeholders across engineering, sales and customer success, and shipping API-integrated products that drive measurable business outcomes.</div>
    </div>
    <div style="display: flex; flex-direction: column; gap: 6px">
      <div class="serif" style="font-size: 11px; letter-spacing: 0.16em; color: #0C1929">CORE COMPETENCIES</div>
      <div style="height: 1px; background: #1E3A5F"></div>
      <div style="display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; font-size: 9.5px; line-height: 1.5; color: #2D3748; font-family: Arial, sans-serif">
        <div><div style="font-weight: 700; color: #1E3A5F; letter-spacing: 0.06em; font-size: 8.5px">PRODUCT MANAGEMENT</div>Roadmap Planning and Execution<br>Backlog Prioritization<br>Sprint Coordination<br>OKRs<br>A/B Testing</div>
        <div><div style="font-weight: 700; color: #1E3A5F; letter-spacing: 0.06em; font-size: 8.5px">API AND INTEGRATION</div>REST APIs<br>B2B Integrations<br>Zendesk Integration<br>API Product Requirements</div>
        <div><div style="font-weight: 700; color: #1E3A5F; letter-spacing: 0.06em; font-size: 8.5px">LANGUAGES</div>English: Native<br>Spanish: Intermediate</div>
        <div><div style="font-weight: 700; color: #1E3A5F; letter-spacing: 0.06em; font-size: 8.5px">ANALYTICS AND DATA</div>Mixpanel<br>SQL<br>Data-Driven Decision Making<br>User Research</div>
        <div><div style="font-weight: 700; color: #1E3A5F; letter-spacing: 0.06em; font-size: 8.5px">TOOLS AND WORKFLOW</div>Jira<br>Figma<br>Agile/Scrum<br>Google Analytics</div>
        <div><div style="font-weight: 700; color: #1E3A5F; letter-spacing: 0.06em; font-size: 8.5px">COLLABORATION</div>Stakeholder Alignment<br>Cross-functional Leadership<br>Go-to-Market Collaboration</div>
      </div>
    </div>
    <div style="display: flex; flex-direction: column; gap: 6px">
      <div class="serif" style="font-size: 11px; letter-spacing: 0.16em; color: #0C1929">PROFESSIONAL EXPERIENCE</div>
      <div style="height: 1px; background: #1E3A5F"></div>
      <div style="font-size: 9.5px; line-height: 1.5; color: #2D3748; font-family: Arial, sans-serif"><span style="font-weight: 700">Senior Product Manager, Vantage Systems</span> <span style="color: #6B7280">January 2022 to present, San Francisco</span><br>Own the B2B integrations roadmap for a 400-customer platform. Shipped the Zendesk and Salesforce connectors, lifting activation 31%.</div>
    </div>
  </div>`;
}

const cvToolbar = `<div style="display: flex; align-items: center; gap: 10px">
  <span class="tool">${I.layout}Templates ${I.chev}</span>
  <span class="tool">${I.edit}Edit</span>
  <span class="tool">${I.copy}Copy</span>
  <span class="tool">${I.download}Download PDF</span>
</div>`;

const jobText = 'Are you passionate about building intuitive B2B platforms? Do you thrive on optimizing customer experiences and scaling API-driven solutions? Pixellot is looking for a Product Manager to own our B2B admin platform, partner integrations and the roadmap that ties them together.';

function stages(list) {
  return `<div style="display: flex; flex-direction: column; gap: 8px">${list.map(([label, state, sub]) => {
    const icon = state === 'done'
      ? `<span style="display: inline-flex; width: 24px; height: 24px; border-radius: 9999px; background: #F5ECD5; color: #A37824; align-items: center; justify-content: center">${I.check}</span>`
      : state === 'active'
        ? `<span style="display: inline-flex; width: 24px; height: 24px; border-radius: 9999px; background: #FBF7EE; color: #C4932E; align-items: center; justify-content: center">${I.loader}</span>`
        : `<span style="display: inline-flex; width: 24px; height: 24px; border-radius: 9999px; border: 1.5px solid #DED4C3; align-items: center; justify-content: center"></span>`;
    const tag = state === 'done' ? '<span style="font-size: 12px; font-weight: 600; color: #A37824">Done</span>' : state === 'active' ? '<span style="font-size: 12px; font-weight: 600; color: #C4932E">Now</span>' : '<span class="muted" style="font-size: 12px">Next</span>';
    return `<div class="stage${state === 'done' ? ' done' : ''}" style="${state === 'todo' ? 'opacity: 0.7' : ''}">${icon}<div style="display: flex; flex-direction: column; gap: 2px; flex: 1"><span style="font-size: 14px; font-weight: 600; color: #2D3748">${label}</span>${sub ? `<span class="muted" style="font-size: 12px">${sub}</span>` : ''}</div>${tag}</div>`;
  }).join('')}</div>`;
}

function progress(pct) {
  return `<div style="display: flex; align-items: center; gap: 10px"><span style="flex: 1; height: 4px; border-radius: 9999px; background: #F5F0E8"><span style="display: block; width: ${pct}%; height: 4px; border-radius: 9999px; background: #D4A853"></span></span><span style="font-size: 12px; font-weight: 600; color: #A37824">${pct}%</span></div>`;
}

function wrap(body, props = '{}') {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
  <style>${CSS}</style>
</helmet>
${body}
</x-dc>
<script data-dc-script data-props='${props}'>
class Component extends DCLogic {
  renderVals() { return {}; }
}
</script>
</body>
</html>`;
}

const frame = (inner) => `<div style="width: 1440px; height: 900px; display: flex; flex-direction: column; background: #FAF7F2; overflow: hidden">${inner}</div>`;


export { CSS, I, wordmark, creditChip, avatar, header, cvDoc, cvToolbar, jobText, stages, progress, wrap, frame };
