import type { Response } from 'express';
import type { RecruiterProfileBody, SeekerProfileBody, SeekerProfileDTO, ResumeDTO } from '@jobportal/shared';
import { JobSeekerProfile, RecruiterProfile, type JobSeekerProfileAttrs } from '../../models';
import { deleteResumeFileIfUnreferenced, streamResumeFile, uploadResumeFile } from '../../infra/gridfs';
import { badRequest, notFound } from '../../http/errors';
import { withId } from '../../utils/serialize';

/** The client sees `resume.fileName`; the internal GridFS id never leaves the server. */
function presentSeeker(profile: JobSeekerProfileAttrs): SeekerProfileDTO {
  const out = withId(profile);
  out.resume = profile.resume?.fileId
    ? {
        fileName: profile.resume.originalName,
        originalName: profile.resume.originalName,
        mimeType: profile.resume.mimeType,
        size: profile.resume.size,
        uploadedAt: profile.resume.uploadedAt?.toISOString()
      }
    : null;
  return out;
}

const resumeOf = (profile: JobSeekerProfileAttrs): ResumeDTO | null => presentSeeker(profile).resume;

// ---- job seeker -----------------------------------------------------------------------------

export async function getSeekerProfile(userId: string): Promise<SeekerProfileDTO> {
  const profile = await JobSeekerProfile.findOneAndUpdate(
    { user: userId },
    { $setOnInsert: { user: userId } },
    { new: true, upsert: true }
  ).lean();
  return presentSeeker(profile);
}

export async function updateSeekerProfile(userId: string, body: SeekerProfileBody): Promise<SeekerProfileDTO> {
  const update = Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined));
  const profile = await JobSeekerProfile.findOneAndUpdate(
    { user: userId },
    { $set: update },
    { new: true, upsert: true, runValidators: true }
  ).lean();
  return presentSeeker(profile);
}

export async function uploadResume(userId: string, file: Express.Multer.File | undefined): Promise<ResumeDTO | null> {
  if (!file) throw badRequest('No resume file uploaded');

  const fileId = await uploadResumeFile(file.buffer, { originalName: file.originalname, mimeType: file.mimetype, userId });
  const previous = await JobSeekerProfile.findOneAndUpdate(
    { user: userId },
    { $set: { resume: { fileId, originalName: file.originalname, mimeType: file.mimetype, size: file.size, uploadedAt: new Date() } } },
    { new: false, upsert: true }
  ).lean();

  await deleteResumeFileIfUnreferenced(previous?.resume?.fileId);
  const profile = await JobSeekerProfile.findOne({ user: userId }).lean();
  return profile ? resumeOf(profile) : null;
}

export async function downloadOwnResume(userId: string, res: Response): Promise<void> {
  const profile = await JobSeekerProfile.findOne({ user: userId }).select('resume').lean();
  if (!profile?.resume?.fileId) throw notFound('No resume on file');
  await streamResumeFile(profile.resume.fileId, res, profile.resume);
}

export async function deleteResume(userId: string): Promise<void> {
  const profile = await JobSeekerProfile.findOneAndUpdate(
    { user: userId, 'resume.fileId': { $exists: true } },
    { $unset: { resume: 1 } },
    { new: false }
  ).lean();
  if (!profile) throw notFound('No resume on file');
  await deleteResumeFileIfUnreferenced(profile.resume?.fileId);
}

// ---- recruiter ------------------------------------------------------------------------------

export async function getRecruiterProfile(userId: string) {
  const profile = await RecruiterProfile.findOneAndUpdate({ user: userId }, { $setOnInsert: { user: userId } }, { new: true, upsert: true })
    .populate('company')
    .lean();
  return withId(profile);
}

export async function updateRecruiterProfile(userId: string, body: RecruiterProfileBody) {
  const update = Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined));
  const profile = await RecruiterProfile.findOneAndUpdate(
    { user: userId },
    { $set: update },
    { new: true, upsert: true, runValidators: true }
  )
    .populate('company')
    .lean();
  return withId(profile);
}
