import type { MatchVerdict } from '@jobportal/shared';
import type { AiMatchOutput, MatchInput } from './provider';

/**
 * Deterministic, explainable fallback used when the AI provider is not configured or fails. It compares the
 * job's required skills with the candidate's listed skills (and, when readable, the resume text) and the
 * required years with the candidate's years. Weighting: skills 70%, experience 30%.
 */

export const verdictFor = (score: number): MatchVerdict =>
  score >= 80 ? 'STRONG' : score >= 60 ? 'GOOD' : score >= 40 ? 'PARTIAL' : 'WEAK';

const normalise = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

function mentions(text: string, skill: string): boolean {
  const escaped = skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Word-ish boundaries that still work for "C++", "Node.js", ".NET".
  return new RegExp(`(^|[^a-z0-9+#.])${escaped}($|[^a-z0-9+#])`, 'i').test(text);
}

/** Years of experience from the profile: the stated total, else the sum of dated roles. */
export function estimateYears(candidate: MatchInput['candidate']): number | null {
  if (candidate.totalExperienceYears !== null) return candidate.totalExperienceYears;
  let ms = 0;
  for (const e of candidate.experience) {
    if (!e.from) continue;
    const start = Date.parse(e.from);
    const end = e.to ? Date.parse(e.to) : Date.now();
    if (Number.isFinite(start) && Number.isFinite(end) && end > start) ms += end - start;
  }
  return ms > 0 ? Math.round((ms / (365.25 * 86_400_000)) * 10) / 10 : null;
}

export function heuristicMatch(input: MatchInput): AiMatchOutput {
  const { job, candidate } = input;
  const listed = new Set(candidate.skills.map(normalise));
  const resumeText = input.resume?.kind === 'text' ? input.resume.text : '';

  const matched: string[] = [];
  const missing: string[] = [];
  for (const skill of job.requiredSkills) {
    const key = normalise(skill);
    if (listed.has(key) || (resumeText && mentions(resumeText, key))) matched.push(skill);
    else missing.push(skill);
  }

  const years = estimateYears(candidate);
  const skillScore = job.requiredSkills.length ? matched.length / job.requiredSkills.length : 0.6;
  const expScore = job.experienceRequired === 0 ? 1 : years === null ? 0.5 : Math.min(1, years / job.experienceRequired);
  const score = Math.round(100 * (0.7 * skillScore + 0.3 * expScore));

  const strengths: string[] = [];
  const gaps: string[] = [];
  const suggestions: string[] = [];

  if (job.requiredSkills.length) {
    if (matched.length) strengths.push(`Shows ${matched.length} of ${job.requiredSkills.length} required skills: ${matched.join(', ')}.`);
    if (missing.length) {
      gaps.push(`No evidence of: ${missing.join(', ')}.`);
      suggestions.push(`If you have worked with ${missing.join(', ')}, add them to your skills and describe where you used them.`);
    }
  }
  if (job.experienceRequired > 0) {
    if (years === null) {
      gaps.push(`Experience could not be determined; the role asks for ${job.experienceRequired} years.`);
      suggestions.push('State your total years of experience and add dated roles to your profile.');
    } else if (years >= job.experienceRequired) {
      strengths.push(`About ${years} years of experience meets the ${job.experienceRequired}-year requirement.`);
    } else {
      gaps.push(`About ${years} years of experience against ${job.experienceRequired} required.`);
    }
  }
  if (!input.resume) suggestions.push('Upload a PDF or DOCX resume so your full experience can be assessed.');

  const summary =
    `Rule-based estimate: ${matched.length}/${job.requiredSkills.length || 0} required skills found` +
    (job.experienceRequired > 0 ? `, ${years ?? 'unknown'} of ${job.experienceRequired} years of experience.` : '.');

  return {
    score,
    summary,
    matchedSkills: matched,
    missingSkills: missing,
    strengths,
    gaps,
    suggestions,
    candidateYearsOfExperience: years
  };
}
