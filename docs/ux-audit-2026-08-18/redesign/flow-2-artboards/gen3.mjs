// Flow 2: the Application Kit panels inside the chat spine. Run: node gen3.mjs
import { writeFileSync } from 'node:fs';
import { I, cvDoc, cvToolbar, stages, wrap } from '../flow-1-artboards/lib.mjs';
import { EXTRA as EX0, sidebar, convoHeader, assistant, userMsg, composer, APPS_READY, spineFrame } from '../flow-1-artboards/final/spine.mjs';

const EXTRA = { ...EX0, back: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 19-7-7 7-7M19 12H5"></path></svg>' };
const APPS = [['Pixellot', 'Product Manager, B2B Platform', 'now', 'Kit ready']];
const side = () => sidebar({ apps: APPS });

// ---- canvas chrome ---------------------------------------------------------
function tabsRow(active, { answers = null } = {}) {
  const tab = (label, icon, key, extra = '') => `<span class="tab${active === key ? ' on' : ''}">${icon}${label}${extra}</span>`;
  return `<div style="display: flex; align-items: center; gap: 12px; padding: 12px 20px; border-bottom: 1px solid #F5F0E8">
    <div class="pillgroup">${tab('CV', I.file, 'cv')}${tab('Cover letter', I.mail, 'cl')}${tab('Emails', I.send, 'em')}${answers !== null ? tab('Answers', EXTRA.star, 'an', `<span style="display: inline-flex; min-width: 18px; height: 18px; padding: 0 5px; border-radius: 9999px; background: #F5ECD5; color: #825E1C; font-size: 10px; font-weight: 700; align-items: center; justify-content: center">${answers}</span>`) : ''}</div>
    <div style="flex: 1"></div>
    <span class="tool">${I.download}Download all</span>
  </div>`;
}
const atsChip = (on) => `<span style="display: inline-flex; align-items: center; gap: 8px; height: 36px; padding: 0 12px; border-radius: 9999px; background: #EEF4F1; color: #3A5A4C; font-size: 13px; font-weight: 600; ${on ? 'box-shadow: 0 0 0 1.5px #9DC3AE inset' : ''}">${EXTRA.shield}ATS 78% <span style="font-weight: 500; opacity: 0.85">· see every change</span></span>`;
const canvasShell = (inner) => `<div style="flex: 1; display: flex; flex-direction: column; min-width: 0; background: #FAF7F2">${inner}</div>`;
const docArea = (inner, extra = '') => `<div style="flex: 1; overflow: hidden; display: flex; justify-content: center; padding: 24px 0 0 0; ${extra}">${inner}</div>`;
const toolbarRow = (inner) => `<div style="display: flex; align-items: center; gap: 12px; padding: 10px 20px; border-bottom: 1px solid #F5F0E8">${inner}</div>`;
const cvRow2 = (atsOn) => toolbarRow(`<div class="pillgroup"><span class="tab">Original</span><span class="tab on">Tailored</span></div><span class="muted" style="font-size: 13px">Tailored for Pixellot.</span><div style="flex: 1"></div>${atsChip(atsOn)}`);

// ---- K1: the ATS view, a canvas of its own (Back returns to the CV) -----
const changes = [
  ['Headline', 'Product Manager | SaaS | Roadmaps', 'Product Manager | B2B SaaS | API & Integration Products | Data-Driven Roadmaps', 'Leads with Pixellot\'s two core requirements.'],
  ['Summary', '...leading cross-functional teams to deliver SaaS products...', '...leading cross-functional teams to deliver B2B SaaS and data-driven products... shipping API-integrated products that drive measurable business outcomes.', 'Names API-integrated delivery and cross-functional alignment.'],
  ['Projects', 'Internal AI Triage Tool, listed last', 'Internal AI Triage Tool, moved up: REST API integration, deployed in under 3 weeks', 'Shows REST API work and fast deployment.'],
  ['Skills', 'Product Management first, API and Integration third', 'API and Integration first, then Product Management', 'Order matches the ad\'s priorities.'],
];
const changeRow = ([t, before, after, why], i) => `<div class="card" style="padding: 16px 18px; display: flex; flex-direction: column; gap: 10px; background: #FFFFFF">
  <div style="display: flex; align-items: center; gap: 10px"><span style="display: inline-flex; width: 22px; height: 22px; border-radius: 9999px; background: #F5ECD5; color: #A37824; align-items: center; justify-content: center">${I.check}</span><span style="font-size: 14px; font-weight: 600; color: #182F4D">${t}</span><span class="muted" style="font-size: 13px">${why}</span></div>
  <div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; padding-left: 32px">
    <div style="display: flex; flex-direction: column; gap: 4px"><span class="muted" style="font-size: 10px; font-weight: 600; letter-spacing: 0.08em">BEFORE</span><span style="font-size: 12.5px; line-height: 1.5; color: #6B7280; text-decoration: line-through; text-decoration-color: #DED4C3">${before}</span></div>
    <div style="display: flex; flex-direction: column; gap: 4px"><span style="font-size: 10px; font-weight: 600; letter-spacing: 0.08em; color: #3A5A4C">AFTER</span><span style="font-size: 12.5px; line-height: 1.5; color: #2D3748; background: #EEF4F1; padding: 6px 8px; border-radius: 8px">${after}</span></div>
  </div>
</div>`;
const atsView = `<div style="flex: 1; display: flex; flex-direction: column; min-height: 0">
  ${toolbarRow(`<span class="tool">${EXTRA.back}Back to CV</span><span class="serif" style="font-size: 16px; color: #182F4D; margin-left: 6px">What changed in your CV</span><div style="flex: 1"></div>${atsChip(false).replace('· see every change', '· Pixellot ad')}`)}
  <div style="flex: 1; overflow: hidden; display: flex; flex-direction: column; gap: 12px; padding: 20px 20px 0 20px">
    <div class="card" style="padding: 16px 18px; display: flex; align-items: center; gap: 18px">
      <div style="display: flex; flex-direction: column; gap: 8px; flex: 1"><div style="display: flex; align-items: center; justify-content: space-between"><span style="font-size: 13px; font-weight: 600; color: #182F4D">ATS compatibility</span><span class="serif" style="font-size: 20px; color: #182F4D">78%</span></div><span style="display: block; height: 6px; border-radius: 9999px; background: #F5F0E8"><span style="display: block; width: 78%; height: 6px; border-radius: 9999px; background: #D4A853"></span></span><span class="muted" style="font-size: 12.5px; line-height: 1.5">Keywords, section order and phrasing matched to the ad. Verified metrics kept exactly as sourced. Four changes, nothing added.</span></div>
    </div>
    ${changes.map(changeRow).join('')}
    <div style="display: flex; align-items: center; gap: 10px; padding: 12px 18px; border-radius: 12px; background: #EEF4F1; color: #3A5A4C; font-size: 13px"><span style="display: inline-flex; width: 22px; height: 22px; border-radius: 9999px; background: #FFFFFF; color: #3A5A4C; align-items: center; justify-content: center">${I.check}</span><span><strong>Nothing added.</strong> Platform scalability and admin-interface experience stay gaps. No invented skills, no invented numbers.</span></div>
  </div>
</div>`;
const K1 = spineFrame(side(),
  `${convoHeader('Pixellot, Product Manager', 'Kit ready')}
   <div style="flex: 1; display: flex; flex-direction: column; gap: 22px; padding: 22px 20px; overflow: hidden">
     ${assistant(`<span>Your kit for Pixellot is ready. Tailored CV (ATS 78%), a cover letter that opens with your 40% engagement result, and two emails. Nothing was invented.</span>
       <div style="display: flex; flex-direction: column; gap: 10px; align-items: flex-start"><span class="chip primary">${I.download}Download the kit</span><span class="chip secondary">${EXTRA.star}Answer screening questions</span></div>`)}
     ${userMsg('What did you change in the CV?')}
     ${assistant(`<span>Four things, before and after on the right. The two gaps (platform scalability, admin interfaces) stayed gaps, I don't invent skills. Back to CV returns you to the page.</span>`)}
   </div>
   ${composer()}`,
  canvasShell(`${tabsRow('cv')}${atsView}`)
);

// ---- K2: Templates strip (all six visible, no blank cards) ----------------
function thumb(name, sel, tag) {
  const lines = (n, w) => Array.from({ length: n }, (_, i) => `<span style="display: block; height: 2px; width: ${w - (i % 3) * 6}px; background: #DED4C3; border-radius: 1px"></span>`).join('');
  return `<div style="display: flex; flex-direction: column; gap: 8px; align-items: center; width: 100px">
    <div style="width: 82px; height: 106px; border-radius: 8px; background: #FFFFFF; padding: 10px 8px; display: flex; flex-direction: column; gap: 4px; ${sel ? 'box-shadow: 0 0 0 2px #D4A853, 0 1px 2px 0 rgb(30 58 95 / 0.06)' : 'border: 1px solid #F5F0E8; box-shadow: 0 1px 2px 0 rgb(30 58 95 / 0.06)'}">
      <span style="display: block; height: 4px; width: 34px; background: #1E3A5F; border-radius: 1px"></span>
      <span style="display: block; height: 2px; width: 46px; background: #C4932E; border-radius: 1px; margin-bottom: 3px"></span>
      ${lines(8, 64)}
    </div>
    <span style="font-size: 11px; font-weight: ${sel ? 600 : 500}; color: ${sel ? '#182F4D' : '#2D3748'}; text-align: center; line-height: 1.2">${name}</span>
    ${tag ? `<span class="status draft" style="height: 18px; font-size: 10px">${tag}</span>` : '<span style="height: 18px"></span>'}
  </div>`;
}
const K2 = spineFrame(side(),
  `${convoHeader('Pixellot, Product Manager', 'Kit ready')}
   <div style="flex: 1; display: flex; flex-direction: column; gap: 22px; padding: 22px 20px; overflow: hidden">
     ${assistant(`<span>Your kit for Pixellot is ready. Tailored CV (ATS 78%), a cover letter that opens with your 40% engagement result, and two emails. Nothing was invented.</span>
       <div style="display: flex; flex-direction: column; gap: 10px; align-items: flex-start"><span class="chip primary">${I.download}Download the kit</span><span class="chip secondary">${EXTRA.star}Answer screening questions</span></div>`)}
   </div>
   ${composer()}`,
  canvasShell(`${tabsRow('cv')}${cvRow2(false)}
    ${toolbarRow(`<span class="tool" style="background: #FFFFFF; border-color: #EBDAAE; color: #182F4D">${I.layout}Templates <span style="transform: rotate(180deg); display: inline-flex">${I.chev}</span></span><span class="tool">${I.edit}Edit</span><span class="tool">${I.copy}Copy</span><span class="tool">${I.download}Download PDF</span>`)}
    <div style="display: flex; align-items: flex-start; gap: 4px; padding: 16px 20px 12px 20px; border-bottom: 1px solid #F5F0E8; background: #FEFDFB; overflow: hidden">
      ${thumb('Premium ATS', true, 'Recommended')}${thumb('Modern Pro', false, 'Tech & startups')}${thumb('Classic', false, '')}${thumb('Executive', false, '')}${thumb('Compact', false, '')}${thumb('European', false, 'DACH & NL')}
    </div>
    ${docArea(cvDoc({ width: 600 }))}`)
);

// ---- K3: Cover letter -----------------------------------------------------
const letter = `<div class="doc" style="width: 600px; padding: 44px 56px; font-family: Arial, sans-serif; font-size: 10.5px; line-height: 1.6; color: #2D3748; display: flex; flex-direction: column; gap: 12px">
  <div>Alex Morgan<br>San Francisco, US<br>alex.morgan@email.com<br>(415) 555-0182</div>
  <div>August 19, 2026</div>
  <div>Hiring Manager<br>Pixellot</div>
  <div>Dear Hiring Manager,</div>
  <div>Reducing customer churn by 22% at TechFlow came down to one discipline: using Mixpanel data to surface friction points nobody had named yet, then building cross-functional alignment around fixing them. That same instinct for translating customer pain into platform action is what Pixellot needs as it scales its B2B customer management system across broadcasters, leagues and media companies.</div>
  <div>As a Senior Product Manager with six years of B2B SaaS experience I've owned end-to-end delivery of API-integrated products, driven a 38% increase in feature adoption through an onboarding redesign grounded in user research, and worked daily with engineering, sales and customer success to align platform capabilities with business needs. My fluency with REST APIs, SQL and data-driven decision making means I move between customer conversations and engineering discussions without losing precision on either side.</div>
  <div>I'd welcome the chance to discuss how my background maps to the platform challenges Pixellot is solving.</div>
  <div>Best regards,<br>Alex Morgan</div>
</div>`;
const K3 = spineFrame(side(),
  `${convoHeader('Pixellot, Product Manager', 'Kit ready')}
   <div style="flex: 1; display: flex; flex-direction: column; gap: 22px; padding: 22px 20px; overflow: hidden">
     ${userMsg('Make the cover letter shorter. Two paragraphs, keep the churn number.')}
     ${assistant(`<span>Rewriting it costs 0.5 credits (you have 2.5).</span><div style="display: flex; gap: 8px"><span class="chip primary">${I.edit}Rewrite it <span class="cost">· 0.5 credits</span></span></div>`)}
     ${userMsg(`<span style="display: inline-flex; align-items: center; gap: 8px; font-weight: 600; color: #182F4D">${I.edit}Rewrite it <span class="cost muted" style="font-weight: 500">· 0.5 credits</span></span>`)}
     ${assistant(`<div class="card" style="padding: 12px">${stages([['Rewriting the cover letter', 'done', 'Two paragraphs, churn result kept in the opening line']])}</div><span>Done, 214 words. It's on the right. Want it punchier or more formal, just say.</span>`)}
   </div>
   ${composer()}`,
  canvasShell(`${tabsRow('cl')}
    ${toolbarRow(`<span class="tool">${I.edit}Edit</span><span class="tool">${I.copy}Copy</span><span class="tool">${I.download}Download ${I.chev}</span><div style="flex: 1"></div><span class="muted" style="font-size: 13px">Updated just now · 214 words</span>`)}
    ${docArea(letter)}`)
);

// ---- K4: Emails, stacked --------------------------------------------------
function emailCard({ label, chip, subject, body }) {
  return `<div class="card" style="width: 100%; box-sizing: border-box; padding: 20px 22px; display: flex; flex-direction: column; gap: 14px; background: #FFFFFF">
    <div style="display: flex; align-items: center; gap: 10px"><span style="font-size: 14px; font-weight: 600; color: #182F4D">${label}</span>${chip ? `<span class="status draft" style="height: 22px">${chip}</span>` : ''}<div style="flex: 1"></div><span class="tool" style="height: 32px; font-size: 13px">${I.copy}Copy email</span></div>
    <div style="display: flex; flex-direction: column; gap: 6px"><span class="muted" style="font-size: 11px; font-weight: 600; letter-spacing: 0.08em">SUBJECT</span><div style="padding: 10px 12px; border-radius: 10px; border: 1px solid #F5F0E8; font-size: 14px; color: #2D3748">${subject}</div></div>
    <div style="display: flex; flex-direction: column; gap: 6px"><span class="muted" style="font-size: 11px; font-weight: 600; letter-spacing: 0.08em">BODY</span><div style="padding: 12px; border-radius: 10px; border: 1px solid #F5F0E8; font-size: 13.5px; line-height: 1.6; color: #2D3748; white-space: pre-line">${body}</div></div>
  </div>`;
}
const K4 = spineFrame(side(),
  `${convoHeader('Pixellot, Product Manager', 'Kit ready')}
   <div style="flex: 1; display: flex; flex-direction: column; gap: 22px; padding: 22px 20px; overflow: hidden">
     ${assistant(`<span>Your kit for Pixellot is ready. Tailored CV (ATS 78%), a cover letter that opens with your 40% engagement result, and two emails. Nothing was invented.</span>
       <div style="display: flex; flex-direction: column; gap: 10px; align-items: flex-start"><span class="chip primary">${I.download}Download the kit</span><span class="chip secondary">${EXTRA.star}Answer screening questions</span></div>`)}
   </div>
   ${composer()}`,
  canvasShell(`${tabsRow('em')}
    ${toolbarRow(`<span class="muted" style="font-size: 13px">Attach the CV and cover letter as PDFs when you send.</span>`)}
    <div style="flex: 1; overflow: hidden; display: flex; flex-direction: column; gap: 16px; padding: 20px 20px 0 20px">
      ${emailCard({ label: 'Application email', chip: null, subject: 'Application: Product Manager, B2B Platform, Alex Morgan', body: `Hello,\n\nIn six years of B2B SaaS product work I reduced customer churn by 22% and increased feature adoption by 38% by building tighter feedback loops between customer success, engineering and data, which maps directly to Pixellot's goal of improving onboarding and account management. My CV and cover letter are attached and walk through the specifics. I'm available for a call any weekday this week or next.\n\nBest regards,\nAlex Morgan` })}
      ${emailCard({ label: 'Follow-up email', chip: 'Send after 5 to 7 business days', subject: 'Following up: Product Manager, B2B Platform', body: `Hello,\n\nI applied for the Product Manager, B2B Platform role last week and wanted to check in. I'm still very interested, particularly in the partner-integration roadmap, and happy to share more on how I cut churn 22% at TechFlow if useful.\n\nBest regards,\nAlex Morgan` })}
    </div>`)
);

// ---- Screening: three variants ------------------------------------------
const question = 'Tell us about a time you increased adoption of an existing product feature. What did you do and what was the result?';
const answerText = 'At TechFlow our B2B analytics dashboard had low engagement with several core features despite strong sign-ups. I ran structured user interviews and analysed Mixpanel data to find where users dropped off during onboarding.\n\nBased on that I redesigned the onboarding workflow: simpler initial setup, contextual tooltips at key friction points, and targeted in-app guidance for new accounts, coordinated with customer success.\n\nFeature adoption rose 38% within two quarters, which directly reduced churn by 22% across 12,000+ monthly active users.';
const answerCard = (extraChips = '') => `<div class="card" style="padding: 14px 16px; display: flex; flex-direction: column; gap: 10px; background: #FFFFFF">
  <span class="muted" style="font-size: 12px; line-height: 1.5">${question}</span>
  <span style="font-size: 14px; line-height: 1.55; color: #2D3748; white-space: pre-line">${answerText}</span>
  <div style="display: flex; gap: 8px; align-items: center"><span class="tool" style="height: 32px; font-size: 13px">${I.copy}Copy answer</span>${extraChips}</div>
</div>`;
const answersDoc = `<div class="doc" style="width: 640px; padding: 32px 36px; display: flex; flex-direction: column; gap: 22px">
  <div style="display: flex; flex-direction: column; gap: 4px"><span class="serif" style="font-size: 18px; color: #182F4D">Screening answers · Pixellot</span><span class="muted" style="font-size: 12px">Every answer uses only what's in your CV. Copy straight into the form.</span></div>
  <div style="display: flex; flex-direction: column; gap: 10px; padding: 16px; border-radius: 12px; background: #FEFDFB; border: 1px solid #F5F0E8">
    <div style="display: flex; align-items: flex-start; gap: 10px"><span style="display: inline-flex; width: 22px; height: 22px; flex-shrink: 0; border-radius: 9999px; background: #1E3A5F; color: #FFFFFF; font-size: 11px; font-weight: 700; align-items: center; justify-content: center">1</span><span style="font-size: 13px; font-weight: 600; color: #182F4D; line-height: 1.45">${question}</span><div style="flex: 1"></div><span class="tool" style="height: 30px; font-size: 12px">${I.copy}Copy</span></div>
    <span style="font-size: 13.5px; line-height: 1.6; color: #2D3748; white-space: pre-line; padding-left: 32px">${answerText}</span>
  </div>
  <span class="muted" style="font-size: 13px; padding: 4px 0">Paste the next question in the chat and it lands here.</span>
</div>`;
const screeningConvo = (tail) => `${convoHeader('Pixellot, Product Manager', 'Kit ready')}
   <div style="flex: 1; display: flex; flex-direction: column; gap: 22px; padding: 22px 20px; overflow: hidden">
     ${userMsg(question)}
     ${tail}
   </div>
   ${composer('Paste the next question')}`;

// V1: chat + Answers tab
const V1 = spineFrame(side(),
  screeningConvo(assistant(`${answerCard()}<span class="muted" style="font-size: 13px">Saved to <strong>Answers</strong> on the right, with every answer for this job.</span>`)),
  canvasShell(`${tabsRow('an', { answers: 1 })}${toolbarRow(`<span class="tool">${I.copy}Copy all</span><span class="tool">${I.download}Download</span>`)}${docArea(answersDoc)}`)
);
// V2: chat only, open as document on demand
const V2 = spineFrame(side(),
  screeningConvo(assistant(`${answerCard(`<span class="tool" style="height: 32px; font-size: 13px">${I.file}Open as document</span>`)}<span class="muted" style="font-size: 13px">Ask the next one whenever you're ready.</span>`)),
  canvasShell(`${tabsRow('cv')}${cvRow2(false)}${toolbarRow(cvToolbar)}${docArea(cvDoc({ width: 600 }))}`)
);
// V3: auto-open in the canvas
const V3 = spineFrame(side(),
  screeningConvo(assistant(`<div class="card" style="padding: 12px">${stages([['Answering from your CV', 'done', 'STAR shape, 38% adoption result']])}</div><span>Your answer's on the right. Copy it from there, or tell me to make it shorter or more formal.</span>`)),
  canvasShell(`${tabsRow('an', { answers: 1 })}${toolbarRow(`<span class="tool">${I.copy}Copy all</span><span class="tool">${I.download}Download</span>`)}${docArea(answersDoc)}`)
);

const out = {
  'Main.dc.html': K1,
  'K2-Templates.dc.html': K2,
  'K3-Cover-Letter.dc.html': K3,
  'K4-Emails.dc.html': K4,
  'K5-Screening-Answers.dc.html': V3,
};
for (const [name, body] of Object.entries(out)) writeFileSync(name, wrap(body));
console.log('wrote', Object.keys(out).join(', '));
