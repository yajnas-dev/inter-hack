import { useMemo } from 'react';
import { useAuth } from '../auth/AuthContext';
import { useSeekerProfile } from '../profile/api';

export interface SkillMatch {
  have: string[];
  missing: string[];
}

/** A plain overlap of the job's required skills with the seeker's listed skills (case-insensitive). Not a score model. */
export function skillMatch(required: string[], mine: Set<string>): SkillMatch {
  const have: string[] = [];
  const missing: string[] = [];
  for (const skill of required) (mine.has(skill.toLowerCase()) ? have : missing).push(skill);
  return { have, missing };
}

/** The signed-in seeker's skills as a lowercase set, or null for everyone else (and for seekers who listed none). */
export function useMySkills(): Set<string> | null {
  const { user } = useAuth();
  const profile = useSeekerProfile({ enabled: user?.role === 'JOB_SEEKER' });
  const skills = profile.data?.skills;
  return useMemo(() => (skills?.length ? new Set(skills.map((s) => s.toLowerCase())) : null), [skills]);
}
