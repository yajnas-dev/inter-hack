import { Link } from 'react-router-dom';
import type { JobListItemDTO } from '@jobportal/shared';
import { employmentLabel, formatSalary, isNew, timeAgo } from '../../shared/lib/format';
import { CompanyLogo } from '../../shared/ui/Avatar';
import { Icon } from '../../shared/ui/Icon';
import SaveButton from './SaveButton';
import type { SkillMatch } from './skillMatch';

interface Props {
  job: JobListItemDTO;
  selected?: boolean;
  saved?: boolean;
  applied?: boolean;
  onToggleSave?: (jobId: string) => void;
  /** Called instead of navigating (desktop split view). Return true to cancel the link. */
  onOpen?: (job: JobListItemDTO) => boolean | undefined;
  /** Hide the skills row (compact lists such as "similar jobs"). */
  compact?: boolean;
  /** How many required skills the signed-in seeker lists (a plain overlap, not a score). */
  match?: SkillMatch | null;
  /** Hover/focus hint so the detail can be fetched before the click. */
  onPrefetch?: (jobId: string) => void;
}

export default function JobCard({ job, selected, saved = false, applied, onToggleSave, onOpen, compact, match, onPrefetch }: Props) {
  const total = job.requiredSkills.length;
  return (
    <article
      className={`job-card${selected ? ' selected' : ''}`}
      data-job-id={job.id}
      onMouseEnter={onPrefetch ? () => onPrefetch(job.id) : undefined}
      onFocus={onPrefetch ? () => onPrefetch(job.id) : undefined}
    >
      <div className="job-card-body">
        <CompanyLogo name={job.company.name} logoUrl={job.company.logoUrl} />
        <div className="grow">
          <h3 style={{ paddingRight: 36 }}>
            <Link
              to={`/jobs/${job.id}`}
              className="title-link"
              aria-current={selected ? 'true' : undefined}
              onClick={(e) => {
                if (onOpen?.(job)) e.preventDefault();
              }}
            >
              {job.title}
            </Link>
          </h3>
          <div className="company">{job.company.name}</div>
          <div className="meta">
            <span>
              <Icon name="pin" />
              {job.location}
            </span>
            <span>{employmentLabel(job.employmentType)}</span>
            <span className="salary">
              <Icon name="money" />
              {formatSalary(job.salaryMin, job.salaryMax)}
            </span>
          </div>
          {!compact && job.requiredSkills.length > 0 && (
            <div className="tags" style={{ marginTop: 10 }}>
              {job.requiredSkills.slice(0, 4).map((s) => (
                <span key={s} className="tag">
                  {s}
                </span>
              ))}
              {job.requiredSkills.length > 4 && <span className="tag">+{job.requiredSkills.length - 4}</span>}
            </div>
          )}
          <div className="foot">
            <span className="row" style={{ gap: 8 }}>
              {isNew(job.createdAt) && <span className="pill pill-new">New</span>}
              {applied && <span className="pill pill-info">Applied</span>}
              {match && total > 0 && (
                <span className="pill pill-match" title={`You list ${match.have.length} of the ${total} required skills`}>
                  {match.have.length}/{total} skills
                </span>
              )}
              <span>{timeAgo(job.createdAt)}</span>
            </span>
            {job.experienceRequired > 0 && <span>{job.experienceRequired}+ yrs</span>}
          </div>
        </div>
      </div>
      {onToggleSave && (
        <div className="save">
          <SaveButton jobId={job.id} saved={saved} onToggle={onToggleSave} />
        </div>
      )}
    </article>
  );
}
