import type { Response } from 'express';
import { isValidTransition, type ApplicationDTO, type ApplicationStatus, type ApplyBody } from '@jobportal/shared';
import { events } from '../../infra/events';
import { streamResumeFile } from '../../infra/gridfs';
import { badRequest, conflict, forbidden, notFound } from '../../http/errors';
import { Application, Job, JobSeekerProfile, User, type ApplicationAttrs } from '../../models';
import { presentApplication } from '../../utils/presenters';
import { assertJobOwner } from '../jobs/jobs.service';

export async function apply(applicantId: string, body: ApplyBody): Promise<ApplicationDTO> {
  const [job, profile, applicant] = await Promise.all([
    Job.findById(body.jobId).select('status company companyName postedBy title location').lean(),
    JobSeekerProfile.findOne({ user: applicantId }).select('resume').lean(),
    User.findById(applicantId).select('name email').lean()
  ]);
  if (!job) throw notFound('Job not found');
  if (job.status !== 'OPEN') throw badRequest('This job is no longer accepting applications');
  if (!profile?.resume?.fileId) throw badRequest('Upload a resume before applying to jobs');
  if (!applicant) throw notFound('User not found');

  // A duplicate {job, applicant} raises 11000 from the unique index; errorHandler maps it to 409 (FR-05).
  const application = await Application.create({
    job: job._id,
    applicant: applicantId,
    company: job.company,
    recruiter: job.postedBy,
    applicantName: applicant.name,
    applicantEmail: applicant.email,
    jobTitle: job.title,
    jobLocation: job.location,
    companyName: job.companyName,
    coverNote: body.coverNote,
    resumeSnapshot: {
      fileId: profile.resume.fileId,
      originalName: profile.resume.originalName,
      mimeType: profile.resume.mimeType,
      size: profile.resume.size
    },
    statusHistory: [{ status: 'APPLIED', changedAt: new Date(), changedBy: applicantId as never }]
  });

  events.emit('application.submitted', { applicationId: String(application._id), jobId: String(job._id), applicantId });
  return presentApplication(application.toObject());
}

export async function listMine(applicantId: string): Promise<ApplicationDTO[]> {
  const rows = await Application.find({ applicant: applicantId }).select('-resumeSnapshot -statusHistory').sort({ appliedAt: -1 }).lean();
  return rows.map((a) => presentApplication(a));
}

/** FR-06: only the recruiter who owns the job sees its applicants. */
export async function listForJob(jobId: string, recruiterId: string): Promise<ApplicationDTO[]> {
  await assertJobOwner(jobId, recruiterId);
  const rows = await Application.find({ job: jobId }).select('-statusHistory').sort({ appliedAt: -1 }).lean();
  return rows.map((a) => presentApplication(a, { includeResume: true }));
}

/** The applicant themself, or the recruiter who owns the job (stored on the application: one read). */
export async function loadAccessible(id: string, user: Express.AuthUser): Promise<ApplicationAttrs> {
  const application = await Application.findById(id).lean();
  if (!application) throw notFound('Application not found');

  const allowed =
    (user.role === 'JOB_SEEKER' && String(application.applicant) === user.id) ||
    (user.role === 'RECRUITER' && String(application.recruiter) === user.id);
  if (!allowed) throw forbidden('You do not have access to this application');
  return application;
}

export async function getForUser(id: string, user: Express.AuthUser): Promise<ApplicationDTO> {
  return presentApplication(await loadAccessible(id, user), { includeResume: true });
}

export async function streamResume(id: string, user: Express.AuthUser, res: Response): Promise<void> {
  const { resumeSnapshot } = await loadAccessible(id, user);
  if (!resumeSnapshot?.fileId) throw notFound('No resume attached to this application');
  await streamResumeFile(resumeSnapshot.fileId, res, resumeSnapshot);
}

/** FR-07: enforces Applied -> Shortlisted -> Interview -> Selected, with Rejected before Selected. */
export async function updateStatus(id: string, user: Express.AuthUser, next: ApplicationStatus): Promise<ApplicationDTO> {
  if (user.role !== 'RECRUITER') throw forbidden('Only recruiters can update application status');
  const current = await loadAccessible(id, user);

  if (!isValidTransition(current.status, next)) {
    throw badRequest(`Cannot move application from ${current.status} to ${next}`);
  }

  // Conditional update guards against two recruiters racing on the same application.
  const updated = await Application.findOneAndUpdate(
    { _id: current._id, status: current.status },
    { $set: { status: next }, $push: { statusHistory: { status: next, changedBy: user.id, changedAt: new Date() } } },
    { new: true }
  ).lean();
  if (!updated) throw conflict('Application status changed, please refresh and retry');

  events.emit('application.statusChanged', { applicationId: id, from: current.status, to: next, changedBy: user.id });
  return presentApplication(updated, { includeResume: true });
}
