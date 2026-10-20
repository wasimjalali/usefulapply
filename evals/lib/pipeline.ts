/**
 * One kit for one case on one arm, driving the REAL production code:
 *
 *   parse_cv -> extract_applicant + parse_job + extract_metrics (parallel, as in production)
 *            -> skill_matching -> fit_assessment            (the "Analyze first" phase)
 *            -> optimize_cv -> write_cover_letter -> write_email -> write_follow_up_email
 *                                                            (generate_with_context, sequential)
 *
 * The methods called are the ones unifiedWriterAgent.runFitAnalysis() and runWithContext()
 * call, in the same order, with the same arguments. They are called one by one instead of
 * through the two orchestrators so that one failed step (for example a cover letter that
 * trips the production validator) is recorded and the rest of the kit still runs. The
 * orchestrators stop at the first failure, which would hide every later task.
 */
import type { MasterContext } from '../../src/lib/agents/types';
import { callContext, executeCall, type CallContext } from './models-shim';
import { assertParseCvPromptMatchesRoute, buildParseCvPrompt, PARSE_CV_MAX_TOKENS, PARSE_CV_SYSTEM, PARSE_CV_TEMPERATURE } from './parse-cv';
import type { ResolvedCase } from './cases';
import type { CallRecord, EvalTask } from './types';

export interface StepFailure {
  step: EvalTask | 'kit';
  message: string;
}

export interface KitRecord {
  run_id: string;
  case_id: string;
  rep: number;
  arm: string;
  prompt_variant: string;
  concurrency: number;
  started_at: string;
  status: 'complete' | 'partial' | 'aborted';
  failures: StepFailure[];
  phases: { parse_cv_ms: number; fit_flow_ms: number; gen_flow_ms: number; kit_ms: number };
  calls: number;
  /** 'chain' runs every step on this arm. 'fixed-inputs' reuses arm A's analysis (applicant, job, match, metrics) and runs only the writing tasks. */
  mode: 'chain' | 'fixed-inputs';
  inputs_from: string | null;
}

export interface KitIntermediates {
  case_id: string;
  rep: number;
  arm: string;
  detectedLanguage: string;
  applicant: MasterContext['applicant'] | null;
  job: MasterContext['job'] | null;
  match: MasterContext['match'] | null;
  verifiedMetrics: string[];
  fitAnalysis: MasterContext['fitAnalysis'] | null;
  optimizedCVData: MasterContext['optimizedCVData'] | null;
  coverLetter: string | null;
  applicationEmail: MasterContext['applicationEmail'] | null;
  followUpEmail: MasterContext['followUpEmail'] | null;
}

assertParseCvPromptMatchesRoute();

/**
 * fixed: arm A's intermediates for this case and rep. When given, extract_applicant, parse_job,
 * extract_metrics and skill_matching are NOT run; the writing tasks (fit_assessment, optimize_cv,
 * cover letter, email, follow-up) run on this arm against A's analysis. parse_cv still runs.
 */
export async function runKit(c: ResolvedCase, ctx: CallContext, fixed?: KitIntermediates): Promise<{ kit: KitRecord; intermediates: KitIntermediates }> {
  const { unifiedWriterAgent } = await import('../../src/lib/agents/unified-writer-agent');
  const failures: StepFailure[] = [];
  const startedAt = new Date();
  const t0 = Date.now();
  const gc = undefined;

  const context: MasterContext = {
    sessionId: `eval-${c.id}`,
    jobDescription: c.jdText,
    rawCV: c.cvText,
    masterCV: c.masterCvText ?? undefined,
    // detectLanguage() is a Workers AI task, outside this eval. The case declares the language.
    detectedLanguage: c.language,
  };

  const fail = (step: EvalTask, error: unknown) => failures.push({ step, message: (error as Error).message });

  return callContext.run(ctx, async () => {
    // parse_cv (a separate upload-time call in production, not part of the kit latency)
    const tParse = Date.now();
    try {
      await executeCall({
        task: 'parse_cv',
        prompt: buildParseCvPrompt(c.cvText),
        systemPrompt: PARSE_CV_SYSTEM,
        temperature: PARSE_CV_TEMPERATURE,
        maxTokens: PARSE_CV_MAX_TOKENS,
        jsonMode: true,
      });
    } catch (e) {
      fail('parse_cv', e);
    }
    const parseMs = Date.now() - tParse;

    // Phase 1 + fit assessment
    const tFit = Date.now();
    if (fixed) {
      context.applicant = fixed.applicant ?? undefined;
      context.job = fixed.job ?? undefined;
      context.match = fixed.match ?? undefined;
      context.verifiedMetrics = fixed.verifiedMetrics ?? [];
    } else {
      const [applicantS, jobS, metricsS] = await Promise.allSettled([
        unifiedWriterAgent.extractApplicantProfile(context.rawCV, context.masterCV, gc),
        unifiedWriterAgent.parseJobDescription(context.jobDescription, gc),
        unifiedWriterAgent.extractVerifiedMetrics(context.rawCV, context.masterCV, gc),
      ]);
      if (applicantS.status === 'fulfilled') context.applicant = applicantS.value.result;
      else fail('extract_applicant', applicantS.reason);
      if (jobS.status === 'fulfilled') context.job = jobS.value.result;
      else fail('parse_job', jobS.reason);
      context.verifiedMetrics = metricsS.status === 'fulfilled' ? metricsS.value.result : [];
      if (metricsS.status === 'rejected') fail('extract_metrics', metricsS.reason);
    }

    const intermediates = (): KitIntermediates => ({
      case_id: c.id,
      rep: ctx.rep,
      arm: ctx.arm.name,
      detectedLanguage: c.language,
      applicant: context.applicant ?? null,
      job: context.job ?? null,
      match: context.match ?? null,
      verifiedMetrics: context.verifiedMetrics ?? [],
      fitAnalysis: context.fitAnalysis ?? null,
      optimizedCVData: context.optimizedCVData ?? null,
      coverLetter: context.coverLetter ?? null,
      applicationEmail: context.applicationEmail ?? null,
      followUpEmail: context.followUpEmail ?? null,
    });
    const finish = (status: KitRecord['status'], fitMs: number, genMs: number): { kit: KitRecord; intermediates: KitIntermediates } => ({
      kit: {
        run_id: ctx.runId,
        case_id: c.id,
        rep: ctx.rep,
        arm: ctx.arm.name,
        prompt_variant: ctx.arm.promptVariant,
        concurrency: ctx.concurrency,
        started_at: startedAt.toISOString(),
        status,
        failures,
        phases: { parse_cv_ms: parseMs, fit_flow_ms: fitMs, gen_flow_ms: genMs, kit_ms: Date.now() - t0 },
        calls: ctx.seq.n,
        mode: fixed ? 'fixed-inputs' : 'chain',
        inputs_from: fixed ? fixed.arm : null,
      },
      intermediates: intermediates(),
    });

    // The production orchestrators treat applicant and job as critical.
    if (!context.applicant || !context.job) return finish('aborted', Date.now() - tFit, 0);

    if (!fixed) {
      try {
        context.match = (await unifiedWriterAgent.computeSkillMatch(context.applicant, context.job, context.rawCV, context.masterCV, gc)).result;
      } catch (e) {
        fail('skill_matching', e);
      }
    }
    try {
      context.fitAnalysis = (await unifiedWriterAgent.generateFitAssessment(context, gc)).result;
    } catch (e) {
      fail('fit_assessment', e);
    }
    const fitMs = Date.now() - tFit;

    // generate_with_context
    const tGen = Date.now();
    try {
      const cv = await unifiedWriterAgent.generateOptimizedCVData(context, gc);
      context.optimizedCVData = cv.cvData;
      context.optimizedCV = cv.legacyCV;
    } catch (e) {
      fail('optimize_cv', e);
    }
    try {
      context.coverLetter = (await unifiedWriterAgent.generateCoverLetter(context, gc)).result.body;
    } catch (e) {
      fail('write_cover_letter', e);
      // Keep the chain going on the raw text so the email prompts see a letter.
      context.coverLetter = ctx.lastRaw.get('write_cover_letter');
    }
    try {
      context.applicationEmail = (await unifiedWriterAgent.generateApplicationEmail(context, gc)).result;
    } catch (e) {
      fail('write_email', e);
    }
    try {
      context.followUpEmail = (await unifiedWriterAgent.generateFollowUpEmail(context, gc)).result;
    } catch (e) {
      fail('write_follow_up_email', e);
    }
    const genMs = Date.now() - tGen;

    return finish(failures.length === 0 ? 'complete' : 'partial', fitMs, genMs);
  });
}

export type { CallRecord };
