import crypto from 'node:crypto';
import { Types } from 'mongoose';
import { RESUME_MIME_TYPES, type MatchAnalysisDTO } from '@jobportal/shared';
import { readFile } from '../../infra/storage/resumeStorage';
import { logger } from '../../infra/logger';
import { NotFoundError, UnprocessableError } from '../../http/errors';
import * as jobs from '../../repositories/job.repository';
import * as matches from '../../repositories/match.repository';
import * as profiles from '../../repositories/profile.repository';
import * as resumes from '../../repositories/resume.repository';
import type { JobAttrs, JobSeekerProfileAttrs } from '../../models';
import { reviewableApplication } from '../applications/applications.service';
import { heuristicMatch, verdictFor } from './heuristic';
import { getMatchProvider, MatchProviderError, type AiMatchOutput, type MatchInput, type ProviderFailure } from './provider';

type User = Express.AuthUser;

/**
 * AI resume <-> job match analysis. The flow never bypasses the API's own rules:
 *   authorisation (who may analyse whom) -> load job/profile/resume through repositories -> cache lookup ->
 *   AI provider (timeout, typed errors, output validated) -> on ANY failure, the deterministic heuristic.
 * The response always says which engine produced it and why a fallback happened.
 */

const FALLBACK_WARNINGS: Record<ProviderFailure, string> = {
  NOT_CONFIGURED: 'AI analysis is not configured on this server; showing a rule-based estimate.',
  TIMEOUT: 'The AI analysis timed out; showing a rule-based estimate.',
  RATE_LIMITED: 'The AI service is busy; showing a rule-based estimate.',
  REFUSED: 'The AI service declined this input; showing a rule-based estimate.',
  TRUNCATED: 'The AI analysis was incomplete; showing a rule-based estimate.',
  INVALID_OUTPUT: 'The AI returned an unusable answer; showing a rule-based estimate.',
  UPSTREAM_ERROR: 'The AI service is unavailable; showing a rule-based estimate.'
};

const RESUME_TEXT_LIMIT = 40_000;

async function buildInput(job: JobAttrs, profile: JobSeekerProfileAttrs | null, resumeId: Types.ObjectId | undefined | null) {
  const warnings: string[] = [];
  let resume: MatchInput['resume'] = null;

  if (resumeId) {
    const meta = await resumes.findById(resumeId);
    if (meta?.mimeType === RESUME_MIME_TYPES.pdf) {
      const data = await readFile(meta.fileId);
      if (data) resume = { kind: 'pdf', data };
    } else if (meta?.mimeType === RESUME_MIME_TYPES.docx) {
      const text = await resumes.findTextById(meta._id);
      if (text) {
        if (text.length > RESUME_TEXT_LIMIT) warnings.push('The resume is unusually long; only its first part was analysed.');
        resume = { kind: 'text', text: text.slice(0, RESUME_TEXT_LIMIT) };
      }
    }
    if (!resume) warnings.push('The resume could not be read (legacy .doc or unreadable file); the analysis uses the profile only.');
  } else {
    warnings.push('No resume on file; the analysis uses the profile only.');
  }

  const input: MatchInput = {
    job: {
      title: job.title,
      company: job.companyName,
      location: job.location,
      employmentType: job.employmentType,
      experienceRequired: job.experienceRequired,
      requiredSkills: job.requiredSkills ?? [],
      description: job.description
    },
    candidate: {
      headline: profile?.headline,
      skills: profile?.skills ?? [],
      totalExperienceYears: profile?.totalExperienceYears ?? null,
      experience: (profile?.experience ?? []).map((e) => ({
        title: e.title,
        company: e.company,
        from: e.startDate ? new Date(e.startDate).toISOString().slice(0, 10) : undefined,
        to: e.isCurrent || !e.endDate ? undefined : new Date(e.endDate).toISOString().slice(0, 10),
        description: e.description
      })),
      education: (profile?.education ?? []).map((e) => ({
        degree: e.degree,
        institution: e.institution,
        fieldOfStudy: e.fieldOfStudy,
        endYear: e.endYear
      }))
    },
    resume
  };
  return { input, warnings };
}

function toDTO(
  job: JobAttrs,
  output: AiMatchOutput,
  engine: MatchAnalysisDTO['engine'],
  warnings: string[],
  model?: string
): Omit<MatchAnalysisDTO, 'cached'> {
  return {
    jobId: String(job._id),
    engine,
    ...(model && { model }),
    score: output.score,
    verdict: verdictFor(output.score),
    summary: output.summary,
    matchedSkills: output.matchedSkills,
    missingSkills: output.missingSkills,
    strengths: output.strengths,
    gaps: output.gaps,
    suggestions: output.suggestions,
    experience: { requiredYears: job.experienceRequired, candidateYears: output.candidateYearsOfExperience },
    warnings,
    generatedAt: new Date().toISOString()
  };
}

async function analyse(
  job: JobAttrs,
  candidateId: Types.ObjectId,
  profile: JobSeekerProfileAttrs | null,
  resumeId?: Types.ObjectId | null
) {
  if (!resumeId && !(profile?.skills?.length || profile?.experience?.length)) {
    throw new UnprocessableError(
      'PROFILE_INCOMPLETE',
      'Add skills or experience to the profile, or upload a resume, before running a match analysis'
    );
  }

  const provider = getMatchProvider();
  const fingerprint = crypto
    .createHash('sha256')
    .update(JSON.stringify(['v1', provider?.model ?? 'none', String(job._id), job.updatedAt, String(resumeId ?? ''), profile?.updatedAt]))
    .digest('hex');

  if (provider) {
    const hit = await matches.find(job._id, candidateId, fingerprint);
    if (hit) return { ...hit, cached: true };
  }

  const { input, warnings } = await buildInput(job, profile, resumeId);
  if (!provider)
    return { ...toDTO(job, heuristicMatch(input), 'heuristic', [FALLBACK_WARNINGS.NOT_CONFIGURED, ...warnings]), cached: false };

  try {
    const started = Date.now();
    const output = await provider.analyze(input);
    const result = toDTO(job, output, 'ai', warnings, provider.model);
    logger.info({ jobId: String(job._id), ms: Date.now() - started, model: provider.model }, 'AI match analysis');
    await matches.store(job._id, candidateId, fingerprint, result);
    return { ...result, cached: false };
  } catch (err) {
    const reason: ProviderFailure = err instanceof MatchProviderError ? err.reason : 'UPSTREAM_ERROR';
    if (!(err instanceof MatchProviderError)) logger.error({ err }, 'unexpected AI match failure');
    return { ...toDTO(job, heuristicMatch(input), 'heuristic', [FALLBACK_WARNINGS[reason], ...warnings]), cached: false };
  }
}

/** A job seeker checks their own current profile and resume against any job. */
export async function matchSeekerToJob(user: User, jobId: string): Promise<MatchAnalysisDTO> {
  const job = await jobs.findById(jobId);
  if (!job) throw new NotFoundError('Job');
  const profile = await profiles.findSeeker(user.id);
  return analyse(job, new Types.ObjectId(user.id), profile, profile?.resume);
}

/** The hiring company (or an admin) analyses an application, using the exact resume that was sent. */
export async function matchApplication(user: User, applicationId: string): Promise<MatchAnalysisDTO> {
  const app = await reviewableApplication(user, applicationId);
  const job = await jobs.findById(app.job);
  if (!job) throw new NotFoundError('Job');
  return analyse(job, app.applicant, await profiles.findSeeker(app.applicant), app.resume);
}
