// Flow 3, locked: the Job Feed in the chat spine. Run: node gen5.mjs
import { writeFileSync } from 'node:fs';
import { I, cvDoc, cvToolbar, stages, progress, wrap } from '../flow-1-artboards/lib.mjs';
import { sidebar, convoHeader, assistant, userMsg, composer, canvasBase } from '../flow-1-artboards/final/spine.mjs';
import { EXTRA, APPS, side, JOBS, badge, meta, cardA, feedHeader, canvasShell, list, feedConvo, feedAnnounce, spine3, detailView, chipRow, field, queries, SA } from './gen4.mjs';

// J1. First-run setup as chips (locked Setup A)
const J1 = SA;

// J2. Building the feed: stages in the chat, the searches ticking in the canvas
const J2 = spine3(side({ feedCount: 0 }), `${convoHeader("Today's feed", 'Building · about a minute')}
  <div style="flex: 1; display: flex; flex-direction: column; gap: 22px; padding: 22px 20px; overflow: hidden">
    ${userMsg('United States · Remote first · $150K')}
    ${assistant(`<span>Building your first feed. I'll show you what I'm doing on the right.</span>
      <div class="card" style="padding: 14px; display: flex; flex-direction: column; gap: 12px">
        ${stages([
          ['Reading your profile', 'done', 'Product · Senior · B2B SaaS, API and integrations'],
          ['Planning ten searches', 'done', 'Titles, markets and angles worth trying'],
          ['Searching', 'active', '6 of 10 done, 41 roles so far'],
          ['Ranking against your CV', 'todo', 'Strong, good and the rest'],
        ])}
        ${progress(55)}
      </div>
      <span class="muted" style="font-size: 13px">After today it refreshes every morning on its own.</span>`)}
  </div>
  ${composer('You can keep typing, I\'ll answer after this')}`,
  canvasShell(`<div style="display: flex; align-items: center; gap: 12px; padding: 16px 20px 12px 20px; border-bottom: 1px solid #F5F0E8"><div style="display: flex; flex-direction: column; gap: 2px"><span class="serif" style="font-size: 20px; color: #182F4D">Searching for you</span><span class="muted" style="font-size: 12.5px">Ten searches, in priority order. 41 roles found so far.</span></div></div>
    <div style="flex: 1; overflow: hidden; display: flex; flex-direction: column; gap: 8px; padding: 16px 20px 0 20px">
      ${[...queries, ['Product Manager Platform Integrations', 'Platform roles with an integrations slant.'], ['Senior PM Developer Tools', 'Your REST API hackathon project opens this door.'], ['Product Lead B2B Analytics', 'Lead-level analytics roles.'], ['Product Manager Supplier Risk', 'Adjacent market, same skills.'], ['Product Manager Remote B2B SaaS', 'Remote-first catch-all.'], ['Product Manager Customer Onboarding', 'Your 38% adoption result.']].map(([q, why], i) => {
        const st = i < 6 ? 'done' : i === 6 ? 'active' : 'todo';
        const ic = st === 'done' ? `<span style="display: inline-flex; width: 24px; height: 24px; border-radius: 9999px; background: #F5ECD5; color: #A37824; align-items: center; justify-content: center">${I.check}</span>` : st === 'active' ? `<span style="display: inline-flex; width: 24px; height: 24px; border-radius: 9999px; background: #FBF7EE; color: #C4932E; align-items: center; justify-content: center">${I.loader}</span>` : `<span style="display: inline-flex; width: 24px; height: 24px; border-radius: 9999px; border: 1.5px solid #DED4C3"></span>`;
        const n = st === 'done' ? `<span style="font-size: 12px; font-weight: 600; color: #A37824">${[9, 7, 5, 6, 8, 6][i]} found</span>` : st === 'active' ? `<span style="font-size: 12px; font-weight: 600; color: #C4932E">Now</span>` : `<span class="muted" style="font-size: 12px">Next</span>`;
        return `<div class="stage${st === 'done' ? ' done' : ''}" style="${st === 'todo' ? 'opacity: 0.7' : ''}">${ic}<div style="display: flex; flex-direction: column; gap: 2px; flex: 1"><span style="font-size: 14px; font-weight: 600; color: #2D3748">${q}</span><span class="muted" style="font-size: 12px">${why}</span></div>${n}</div>`;
      }).join('')}
    </div>`));

// J3. The daily feed (locked Layout A + Card A with Details link)
const J3 = spine3(side(), feedConvo(`${feedAnnounce}${userMsg('Why Avetta first?')}${assistant('<span>Avetta asks for B2B SaaS ownership, supplier-side integrations and a data-driven roadmap. Your Zendesk and Salesforce connector work and the 22% churn result hit all three. Salary is in your range and it\'s remote. Zapier is a close second, it leans more on developer experience.</span>')}`),
  canvasShell(`${feedHeader()}${list(JOBS.slice(0, 4).map((j, i) => cardA(j, { selected: i === 0 })))}`));

// J4. Job detail in the canvas, Back to feed
const J4 = spine3(side(), feedConvo(`${feedAnnounce}${userMsg('Open Avetta')}${assistant('<span>On the right. Check fit when you\'re ready, or ask me anything about it first.</span>')}`),
  canvasShell(detailView(JOBS[0])));

// J5. Check fit from the card: a new application conversation, fit running
const APPS_NOW = [['Avetta', 'Product Manager, B2B SaaS', 'now', 'Now'], ...APPS];
const J5 = spine3(sidebar({ apps: APPS_NOW, active: 0, plan: 'Plus plan', credits: '40.5 of 50 credits', pct: 81, feedCount: 20 }),
  `${convoHeader('Avetta, Product Manager', 'Checking fit · from today\'s feed')}
   <div style="flex: 1; display: flex; flex-direction: column; gap: 22px; padding: 22px 20px; overflow: hidden">
     ${userMsg(`<div style="display: flex; flex-direction: column; gap: 6px"><span style="font-weight: 600; color: #182F4D">Product Manager, B2B SaaS · Avetta</span><span class="muted">From today's feed · Remote, US · $87.5K to $180K</span></div>`)}
     ${userMsg(`<span style="display: inline-flex; align-items: center; gap: 8px; font-weight: 600; color: #182F4D">${I.search}Check fit <span class="cost muted" style="font-weight: 500">· 0.5 credits</span></span>`)}
     ${assistant(`<span>On it. About 20 seconds.</span>
       <div class="card" style="padding: 14px; display: flex; flex-direction: column; gap: 12px">
         ${stages([['Reading the job ad', 'done', 'Role, must-haves, nice-to-haves'], ['Matching your skills', 'done', '15 of 17 requirements covered'], ['Scoring the fit', 'active', 'Strengths, gaps and a recommendation']])}
         ${progress(70)}
       </div>`)}
   </div>
   ${composer('Working... you can keep typing')}`,
  canvasBase().replace('<span style="font-weight: 600">Base CV.</span><span class="muted">Not tailored to this job yet.</span>', `${I.loader}<span style="color: #825E1C"><strong>Checking fit for Avetta.</strong> Your CV stays here. The score lands in the chat.</span>`).replace('border-bottom: 1px solid #F5F0E8; font-size: 13px"><span', 'border-bottom: 1px solid #EBDAAE; background: #FBF7EE; font-size: 13px"><span'));

// J6. Edit feed as a canvas view, first visit: Searches and Preferences pills nudge
const nudgePill = (label) => `<span class="tab" style="position: relative; box-shadow: 0 0 0 2px #F5ECD5">${label}<span style="position: absolute; top: -3px; right: -3px; width: 9px; height: 9px; border-radius: 9999px; background: #D4A853; box-shadow: 0 0 0 3px #FBF7EE"></span></span>`;
const J6 = spine3(side(), feedConvo(`${feedAnnounce}${userMsg('Open Edit feed')}${assistant('<span>It\'s on the right: what I read from your CV, the ten searches I run and your preferences. Change anything there, or just tell me: "drop Group PM", "add Berlin", "no agencies".</span>')}`),
  canvasShell(`<div style="display: flex; align-items: center; gap: 12px; padding: 10px 20px; border-bottom: 1px solid #F5F0E8"><span class="tool">${EXTRA.back}Back to feed</span><span class="serif" style="font-size: 15px; color: #182F4D; margin-left: 4px; white-space: nowrap">How I search for you</span><div style="flex: 1"></div><div class="pillgroup"><span class="tab on">Profile</span>${nudgePill('Searches')}${nudgePill('Preferences')}</div></div>
    <div style="flex: 1; overflow: hidden; display: flex; flex-direction: column; gap: 12px; padding: 20px 20px 0 20px">
      <div class="card" style="padding: 18px; display: flex; flex-direction: column; gap: 14px; background: #FFFFFF">
        <div style="display: flex; align-items: center; gap: 10px"><span style="font-size: 14px; font-weight: 600; color: #182F4D">What I read from your CV</span><span class="muted" style="font-size: 12px">refreshed 19 Aug</span><div style="flex: 1"></div><span class="tool" style="height: 32px; font-size: 13px">${I.edit}Edit</span></div>
        <div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px">
          ${field('DISCIPLINE', '<span style="font-size: 14px">Product · Senior · 7+ years</span>')}
          ${field('INDUSTRIES', chipRow(['Enterprise SaaS', 'Data analytics']))}
        </div>
        ${field('BEST-FIT TITLES', chipRow(['Senior Product Manager', 'Product Manager, API and Integrations', 'Product Manager, B2B SaaS', 'Group Product Manager']))}
        ${field('STRONGEST SKILL AREAS', '<span style="font-size: 13.5px; line-height: 1.6; color: #2D3748"><strong>B2B SaaS product management:</strong> roadmap, backlog, OKRs, stakeholder alignment. <strong>Data-driven decisions:</strong> Mixpanel, SQL, A/B testing. <strong>API and integration ownership:</strong> REST APIs, Zendesk, B2B integrations.</span>')}
        ${field('IN ONE PARAGRAPH', '<span style="font-size: 13.5px; line-height: 1.6; color: #2D3748">Senior Product Manager with 7 years in B2B SaaS, API-integrated products and analytics-driven roadmaps. Owns a 12,000+ MAU analytics dashboard and a cross-functional pod; 22% churn reduction, 38% adoption lift. Trajectory points to Group PM.</span>')}
      </div>
      <div style="display: flex; align-items: center; gap: 10px; padding: 12px 16px; border-radius: 12px; background: #FBF7EE; border: 1px solid #EBDAAE; font-size: 13px; color: #825E1C"><span style="display: inline-flex; width: 9px; height: 9px; border-radius: 9999px; background: #D4A853"></span><span>First time here? <strong>Searches</strong> shows the ten queries I run and why. <strong>Preferences</strong> holds countries, work mode, salary floor and words to avoid.</span></div>
    </div>`));

// J7. Free tier: top five, one upgrade line, same everything else
const J7 = spine3(sidebar({ apps: [['Pixellot', 'Product Manager, B2B Platform', 'draft', 'Kit ready']], active: -1, feedActive: true, feedCount: 5 }),
  feedConvo(assistant(`<span>Good morning. I searched for you overnight and found 14 roles. Here are your <strong>top 5</strong>, Avetta first: B2B SaaS, integrations, remote, in your range.</span>
    <div style="display: flex; flex-wrap: wrap; gap: 8px"><span class="chip secondary" style="height: 36px; padding: 0 14px; font-size: 13px">Why Avetta first?</span><span class="chip secondary" style="height: 36px; padding: 0 14px; font-size: 13px">Only remote</span></div>
    <span class="muted" style="font-size: 13px">Plus searches more sources and shows all 20, with Edit feed to steer it.</span>`)),
  canvasShell(`${feedHeader({ title: 'Your top 5 today', sub: 'Ranked for Product, Senior, B2B SaaS · United States · refreshed 09:25' }).replace(`<span class="tool" style="">${EXTRA.sliders}Edit feed</span>`, '')}
    ${list([...JOBS.slice(0, 3).map((j) => cardA(j)), `<div style="display: flex; align-items: center; gap: 14px; padding: 14px 18px; border-radius: 16px; background: #FBF7EE; border: 1px solid #EBDAAE"><span style="flex: 1; font-size: 13.5px; color: #825E1C"><strong>9 more roles matched today.</strong> Plus shows all 20, searches more sources and lets you steer the feed.</span><span class="btn-gold" style="height: 40px; padding: 0 16px; font-size: 13px">See Plus ${I.arrow}</span></div>`])}`));

const out = {
  'Main.dc.html': J1,
  'J2-Building.dc.html': J2,
  'J3-Daily-Feed.dc.html': J3,
  'J4-Job-Detail.dc.html': J4,
  'J5-Check-Fit-From-Card.dc.html': J5,
  'J6-Edit-Feed.dc.html': J6,
  'J7-Free-Top-5.dc.html': J7,
};
for (const [name, body] of Object.entries(out)) writeFileSync(name, wrap(body));
console.log('wrote', Object.keys(out).join(', '));
