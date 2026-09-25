import { Types } from 'mongoose';
import { APPLICATION_STATUSES, type ApplicationStatus, type RecruiterOverviewDTO } from '@jobportal/shared';
import { Application, Job } from '../../models';
import { presentApplication } from '../../utils/presenters';

/** Everything a recruiter's home screen shows, from three grouped counts and one short list. */
export async function getRecruiterOverview(userId: string): Promise<RecruiterOverviewDTO> {
  const owner = new Types.ObjectId(userId);
  const weekAgo = new Date(Date.now() - 7 * 86_400_000);

  const [jobRows, statusRows, newThisWeek, recent] = await Promise.all([
    Job.aggregate<{ _id: 'OPEN' | 'CLOSED'; n: number }>([{ $match: { postedBy: owner } }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
    Application.aggregate<{ _id: ApplicationStatus; n: number }>([
      { $match: { recruiter: owner } },
      { $group: { _id: '$status', n: { $sum: 1 } } }
    ]),
    Application.countDocuments({ recruiter: owner, appliedAt: { $gte: weekAgo } }),
    Application.find({ recruiter: owner }).select('-statusHistory -resumeSnapshot').sort({ appliedAt: -1 }).limit(5).lean()
  ]);

  const applicantsByStatus = Object.fromEntries(APPLICATION_STATUSES.map((s) => [s, 0])) as Record<ApplicationStatus, number>;
  for (const row of statusRows) applicantsByStatus[row._id] = row.n;

  return {
    jobs: { open: jobRows.find((r) => r._id === 'OPEN')?.n ?? 0, closed: jobRows.find((r) => r._id === 'CLOSED')?.n ?? 0 },
    applicantsByStatus,
    totalApplicants: Object.values(applicantsByStatus).reduce((a, b) => a + b, 0),
    newThisWeek,
    recent: recent.map((a) => presentApplication(a))
  };
}
