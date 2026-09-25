import type { ApplicantProfileDTO } from '@jobportal/shared';
import { forbidden } from '../../http/errors';
import { JobSeekerProfile } from '../../models';
import { withId } from '../../utils/serialize';
import { loadAccessible } from './applications.service';

/**
 * FR-06: a recruiter may view the profile of someone who applied to one of their jobs.
 * The access rule is the same one used for the application itself (owning recruiter only).
 */
export async function getApplicantProfile(applicationId: string, user: Express.AuthUser): Promise<ApplicantProfileDTO> {
  if (user.role !== 'RECRUITER') throw forbidden('Only recruiters can view applicant profiles');
  const application = await loadAccessible(applicationId, user);
  const profile = await JobSeekerProfile.findOne({ user: application.applicant }).lean();

  return {
    name: application.applicantName,
    email: application.applicantEmail,
    headline: profile?.headline,
    phone: profile?.phone,
    address: profile?.address,
    skills: profile?.skills ?? [],
    education: withId(profile?.education ?? []),
    experience: withId(profile?.experience ?? [])
  };
}
