import type { JobFacetsDTO, JobListItemDTO } from '@jobportal/shared';
import { env } from '../../config/env';
import { createSwrCache } from '../../infra/cache/swr';
import { notFound } from '../../http/errors';
import { Job } from '../../models';
import { presentJob } from '../../utils/presenters';

type NameCount = { name: string; count: number };

// Filter options with live counts: feeds the home-page chips and the filter menus. Cached for 5 minutes.
const facetCache = createSwrCache<JobFacetsDTO>(env.isTest ? 0 : 5 * 60 * 1000, 2);

export const facets = (): Promise<JobFacetsDTO> =>
  facetCache.get('facets', async () => {
    const open = { $match: { status: 'OPEN' } };
    const [locations, skills, types, totalOpen] = await Promise.all([
      Job.aggregate<NameCount>([
        open,
        { $group: { _id: '$locationLower', name: { $first: '$location' }, count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 12 },
        { $project: { _id: 0, name: 1, count: 1 } }
      ]),
      Job.aggregate<NameCount>([
        open,
        { $unwind: '$requiredSkills' },
        { $group: { _id: { $toLower: '$requiredSkills' }, name: { $first: '$requiredSkills' }, count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 20 },
        { $project: { _id: 0, name: 1, count: 1 } }
      ]),
      Job.aggregate<{ _id: JobFacetsDTO['employmentTypes'][number]['name']; count: number }>([
        open,
        { $group: { _id: '$employmentType', count: { $sum: 1 } } }
      ]),
      Job.countDocuments({ status: 'OPEN' })
    ]);
    return { locations, skills, employmentTypes: types.map((t) => ({ name: t._id, count: t.count })), totalOpen };
  });

/** Rule-based (not ML): open jobs at the same company or sharing a required skill, newest first. */
export async function similarTo(id: string): Promise<{ jobs: JobListItemDTO[] }> {
  const job = await Job.findById(id).select('company requiredSkillsLower').lean();
  if (!job) throw notFound('Job not found');

  const rows = await Job.find({
    status: 'OPEN',
    _id: { $ne: job._id },
    $or: [{ company: job.company }, { requiredSkillsLower: { $in: job.requiredSkillsLower ?? [] } }]
  })
    .select('-description')
    .sort({ createdAt: -1, _id: -1 })
    .limit(4)
    .lean();
  return { jobs: rows.map(presentJob) };
}
