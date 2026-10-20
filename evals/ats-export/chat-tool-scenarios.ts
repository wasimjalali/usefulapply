/**
 * Scenarios for the chat CV tools, run through the real tool handlers:
 *   - the first heading rename of a CV succeeds, and the renamed heading renders in the PDF
 *   - hiding a whole section protects its entries: a role delete is refused, the outline marks them hidden
 *   - a hidden summary cannot be rewritten (no paid rewrite of content that is not on the page)
 *
 *   npx tsx --tsconfig evals/ats-export/tsconfig.json evals/ats-export/chat-tool-scenarios.ts
 *
 * The rename render needs the Browser Run eval worker (started on demand).
 */
import { CV_TOOLS } from '../../src/lib/agents/chat-tools/cv-tools';
import type { ChatToolContext } from '../../src/lib/agents/chat-tools/types';
import type { TailoredCV } from '../../src/lib/cv-structure/types';
import { buildCvData } from '../../src/lib/cv-templates/build-cv-data';
import { resolveExport } from '../../src/lib/services/export/resolve';
import { renderExport } from '../../src/lib/services/export/render';
import { US_ONE_PAGE } from './fixtures';
import { ensureWorker, loadFontFromDisk, workerBinding } from './lib/render';
import { pdftotext } from './lib/poppler';
import { kitFor } from './render-all';
import { squash } from './lib/expect';

const tool = (name: string) => CV_TOOLS.find((t) => t.name === name)!;

function tailored(extra: Partial<TailoredCV> = {}): TailoredCV {
  const cv = US_ONE_PAGE;
  return {
    personal: { fullName: cv.personal.fullName, email: cv.personal.email, phone: cv.personal.phone, currentTitle: cv.personal.currentTitle, city: cv.personal.city, country: cv.personal.country },
    summary: cv.summary,
    experience: cv.experience,
    education: cv.education,
    skills: cv.skills,
    languages: cv.languages,
    certifications: cv.certifications,
    analysis: { summary: 'Tailored.', key_changes: [], ats_compatibility: 92, missing_keywords_added: [] },
    ...extra,
  } as unknown as TailoredCV;
}

function context(cv: TailoredCV): ChatToolContext {
  return {
    userId: 'scenario-user',
    userMessage: 'Rename the Experience heading to Work Experience.',
    userMessagePasted: false,
    timeZone: 'UTC',
    sessionId: '5d2f6c1e-8a3b-4c57-9e21-3b7a1f0c9d11',
    tailoredCV: cv,
    cvOutlineRead: false,
    cvWorking: null,
    cvTemplateId: 'premium-ats',
  };
}

export async function runChatToolScenarios(): Promise<{ ok: boolean; failures: string[]; checks: string[] }> {
  const failures: string[] = [];
  const checks: string[] = [];
  const check = (condition: boolean, message: string) => {
    console.log(`${condition ? 'PASS' : 'FAIL'} chat-tools ${message}`);
    checks.push(message);
    if (!condition) failures.push(message);
  };

  // 1. The first heading rename of a CV.
  {
    const cv = tailored();
    const ctx = context(cv);
    const outline = (await tool('get_cv_outline').handler({}, ctx)).data as { renameable_as?: Record<string, string[]> };
    const options = outline.renameable_as?.experience ?? [];
    check(options.some((o) => o.toLowerCase() === 'work experience'), `Work Experience is offered for the Experience heading (${options.join(', ')})`);
    const result = await tool('edit_cv_structure').handler({ operation: 'rename_heading', section: 'experience', heading: 'Work Experience' }, ctx);
    const data = result.data as { ok?: boolean; error?: string };
    check(data.ok === true, `the first rename succeeds${data.error ? ` (got: ${data.error})` : ''}`);
    const updated = result.executed?.[0] && 'cv' in result.executed[0] ? (result.executed[0].cv as TailoredCV) : null;
    check(Boolean(updated && updated.sectionHeaders?.experience?.toLowerCase() === 'work experience' && updated.renamedHeadings?.includes('experience')), 'the stored heading and the renamed flag are set');
    if (updated) {
      // And it renders: through the real export, the PDF text has the new heading.
      await ensureWorker();
      const cvData = buildCvData({
        structuredCV: { personal: { fullName: 'x', email: 'x@example.com', phone: '1' }, summary: '', experience: [], education: [], skills: [], languages: [], certifications: [], customSections: [], settings: {} } as never,
        optimizedCVData: updated as never,
        showOptimized: true,
      })!;
      const deps = { browser: workerBinding([]), loadFont: loadFontFromDisk };
      const rendered = await renderExport(resolveExport(kitFor({ cv: cvData, originalCv: cvData, applicantName: cvData.personal.fullName }), 'cv_pdf', { templateId: 'premium-ats' }), deps);
      const text = await pdftotext(rendered.bytes, 'raw');
      check(squash(text).toLowerCase().includes('workexperience'), 'the renamed heading "Work Experience" is in the PDF');
    }
  }

  // 2. A hidden Experience section protects its roles.
  {
    const cv = tailored({ hiddenSections: ['experience'] } as Partial<TailoredCV>);
    const ctx = context(cv);
    const outline = (await tool('get_cv_outline').handler({}, ctx)).data as { lists?: Array<{ list: string; items: Array<{ handle: string; hidden?: boolean }> }>; hidden_sections?: string[] };
    const roles = outline.lists?.find((l) => l.list === 'experience')?.items ?? [];
    check(roles.length > 0 && roles.every((r) => r.hidden), 'the outline marks every role of a hidden section as hidden');
    const deleted = await tool('delete_cv_item').handler({ handle: roles[0].handle }, ctx);
    const data = deleted.data as { ok?: boolean; error?: string; requires_confirmation?: boolean };
    check(Boolean(data.error) && !data.requires_confirmation && !(deleted.actions?.length), 'deleting a role of a hidden section is refused, with no confirm button');
    const bullets = roles.length ? (outline.lists ?? []).find((l) => l.list.startsWith('bullets:')) : undefined;
    if (bullets) {
      const bulletDelete = await tool('delete_cv_item').handler({ handle: bullets.items[0].handle }, ctx);
      check(Boolean((bulletDelete.data as { error?: string }).error) && !(bulletDelete.actions?.length), 'deleting a bullet of a hidden section is refused');
    }
  }

  // 3. A hidden summary cannot be rewritten.
  {
    const cv = tailored({ hiddenSections: ['summary'] } as Partial<TailoredCV>);
    const ctx = context(cv);
    await tool('get_cv_outline').handler({}, ctx);
    const rewrite = await tool('propose_cv_rewrite').handler({ section: 'summary' }, ctx);
    const data = rewrite.data as { error?: string; requires_confirmation?: boolean };
    check(Boolean(data.error) && !data.requires_confirmation && !(rewrite.actions?.length), 'rewriting a hidden summary is refused, with no confirm button');
  }

  return { ok: failures.length === 0, failures, checks };
}

if (require.main === module) {
  runChatToolScenarios()
    .then((result) => process.exit(result.ok ? 0 : 1))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
