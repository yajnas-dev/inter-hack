import type { ClientSession, Types } from 'mongoose';
import type { RecruiterProfileBody } from '@jobportal/shared';
import { JobSeekerProfile, RecruiterProfile, type CompanyAttrs, type JobSeekerProfileAttrs, type RecruiterProfileAttrs } from '../models';

// ---- job seeker -------------------------------------------------------------------------------

/** Profiles are created at registration; the upsert also heals accounts created before that existed. */
export const getSeeker = (userId: string) =>
  JobSeekerProfile.findOneAndUpdate(
    { user: userId },
    { $setOnInsert: { user: userId } },
    { new: true, upsert: true }
  ).lean<JobSeekerProfileAttrs>();

export const findSeeker = (userId: string | Types.ObjectId) => JobSeekerProfile.findOne({ user: userId }).lean<JobSeekerProfileAttrs>();

export const updateSeeker = (userId: string, set: Partial<JobSeekerProfileAttrs>) =>
  JobSeekerProfile.findOneAndUpdate(
    { user: userId },
    { $set: set },
    { new: true, upsert: true, runValidators: true }
  ).lean<JobSeekerProfileAttrs>();

/** Sets (or clears) the current resume and returns the previous one's id. */
export async function setCurrentResume(userId: string, resumeId: Types.ObjectId | null): Promise<Types.ObjectId | null> {
  const previous = await JobSeekerProfile.findOneAndUpdate(
    { user: userId },
    resumeId ? { $set: { resume: resumeId } } : { $unset: { resume: 1 } },
    { new: false, upsert: true }
  ).lean();
  return previous?.resume ?? null;
}

/** Clears the current resume only if it is still `resumeId` (safe against a concurrent new upload). */
export const clearCurrentResumeIf = (userId: string, resumeId: Types.ObjectId) =>
  JobSeekerProfile.updateOne({ user: userId, resume: resumeId }, { $unset: { resume: 1 } });

export const skillsForUsers = (userIds: Types.ObjectId[]) =>
  JobSeekerProfile.find({ user: { $in: userIds } })
    .select('user skills')
    .lean();

export const createSeeker = (userId: Types.ObjectId, session?: ClientSession) => JobSeekerProfile.create([{ user: userId }], { session });

// ---- recruiter ---------------------------------------------------------------------------------

type RecruiterWithCompany = Omit<RecruiterProfileAttrs, 'company'> & { company?: CompanyAttrs | null };

export const getRecruiter = (userId: string) =>
  RecruiterProfile.findOneAndUpdate({ user: userId }, { $setOnInsert: { user: userId } }, { new: true, upsert: true })
    .populate('company')
    .lean<RecruiterWithCompany>();

export const updateRecruiter = (userId: string, set: RecruiterProfileBody) =>
  RecruiterProfile.findOneAndUpdate({ user: userId }, { $set: set }, { new: true, upsert: true, runValidators: true })
    .populate('company')
    .lean<RecruiterWithCompany>();

export const companyIdOf = async (userId: string): Promise<Types.ObjectId | null> =>
  (await RecruiterProfile.findOne({ user: userId }).select('company').lean())?.company ?? null;

export const setCompany = (userId: string, companyId: Types.ObjectId, session?: ClientSession) =>
  RecruiterProfile.updateOne({ user: userId }, { $set: { company: companyId } }, { upsert: true, session });

export const unsetCompany = (companyId: unknown, session?: ClientSession) =>
  RecruiterProfile.updateMany({ company: companyId }, { $unset: { company: 1 } }, { session });

export const createRecruiter = (userId: Types.ObjectId, session?: ClientSession) =>
  RecruiterProfile.create([{ user: userId }], { session });

// ---- both --------------------------------------------------------------------------------------

export async function deleteForUser(userId: unknown, session?: ClientSession): Promise<void> {
  await Promise.all([JobSeekerProfile.deleteOne({ user: userId }, { session }), RecruiterProfile.deleteOne({ user: userId }, { session })]);
}
