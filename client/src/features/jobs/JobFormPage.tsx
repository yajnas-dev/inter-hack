import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { EMPLOYMENT_TYPES, jobCreateBody, jobUpdateBody } from '@jobportal/shared';
import { errorMessage } from '../../shared/api/http';
import { employmentLabel } from '../../shared/lib/format';
import { Button } from '../../shared/ui/Button';
import { ToggleChip } from '../../shared/ui/Chip';
import { QueryBoundary, Skeleton } from '../../shared/ui/Feedback';
import { SelectField, TextArea, TextField } from '../../shared/ui/fields';
import { useToast } from '../../shared/ui/toast';
import { useRecruiterProfile } from '../profile/api';
import ChipInput from '../profile/ChipInput';
import { useFacets, useJob, useJobMutations } from './api';
import JobCard from './JobCard';

const formSchema = z.object({
  title: z.string().min(1, 'Job title is required'),
  description: z.string().min(1, 'Job description is required'),
  location: z.string().min(1, 'Location is required'),
  employmentType: z.enum(EMPLOYMENT_TYPES),
  salaryMin: z.coerce.number({ invalid_type_error: 'Enter a number' }).min(0),
  salaryMax: z.coerce.number({ invalid_type_error: 'Enter a number' }).min(0),
  experienceRequired: z.coerce.number({ invalid_type_error: 'Enter a number' }).min(0),
  vacancies: z.coerce.number().int().min(1).optional(),
  requiredSkills: z.array(z.string())
});
type FormValues = z.input<typeof formSchema>;

function JobForm({
  jobId,
  sourceId,
  companyId,
  companyName
}: {
  jobId?: string;
  sourceId?: string;
  companyId?: string;
  companyName?: string;
}) {
  const navigate = useNavigate();
  const toast = useToast();
  const { create, update } = useJobMutations();
  const existing = useJob(jobId ?? sourceId);
  const [formError, setFormError] = useState('');
  const facets = useFacets();
  const {
    register,
    control,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting, isDirty }
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { employmentType: 'FULL_TIME', vacancies: 1, requiredSkills: [] }
  });

  useEffect(() => {
    const job = existing.data;
    if (job) reset({ ...job, title: sourceId ? `${job.title} (copy)` : job.title, requiredSkills: job.requiredSkills });
  }, [existing.data, sourceId, reset]);

  // Leaving with unsaved edits asks first (closing the tab or reloading).
  useEffect(() => {
    if (!isDirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [isDirty]);

  const values = watch();
  const preview = {
    id: 'preview',
    title: values.title || 'Job title',
    company: { id: companyId ?? 'preview', name: companyName ?? 'Your company' },
    location: values.location || 'Location',
    salaryMin: Number(values.salaryMin) || 0,
    salaryMax: Number(values.salaryMax) || 0,
    requiredSkills: values.requiredSkills ?? [],
    experienceRequired: Number(values.experienceRequired) || 0,
    employmentType: values.employmentType,
    status: 'OPEN' as const,
    createdAt: new Date().toISOString()
  };

  const onSubmit = handleSubmit(async (raw) => {
    setFormError('');
    const payload = formSchema.parse(raw);
    try {
      if (jobId) {
        const body = jobUpdateBody.safeParse(payload);
        if (!body.success) return setFormError(body.error.issues[0]?.message ?? 'Invalid job');
        await update.mutateAsync({ id: jobId, body: body.data });
      } else {
        const body = jobCreateBody.safeParse({ ...payload, company: companyId });
        if (!body.success) return setFormError(body.error.issues[0]?.message ?? 'Invalid job');
        await create.mutateAsync(body.data);
      }
      toast.success(jobId ? 'Job updated.' : 'Job posted.');
      navigate('/recruiter/jobs');
    } catch (err) {
      setFormError(errorMessage(err, 'Failed to save job'));
    }
  });

  if ((jobId || sourceId) && existing.isPending) return <Skeleton height={320} />;

  return (
    <div className="two-col">
      <form className="stack" onSubmit={onSubmit} noValidate>
        <section className="card">
          <h2>Basics</h2>
          <TextField label="Job title" error={errors.title?.message} {...register('title')} />
          <div className="grid-2">
            <TextField label="Location" error={errors.location?.message} {...register('location')} />
            <SelectField label="Employment type" error={errors.employmentType?.message} {...register('employmentType')}>
              {EMPLOYMENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {employmentLabel(t)}
                </option>
              ))}
            </SelectField>
          </div>
          <TextArea label="Description" rows={8} error={errors.description?.message} {...register('description')} />
        </section>

        <section className="card">
          <h2>Requirements and pay</h2>
          <Controller
            control={control}
            name="requiredSkills"
            render={({ field }) => (
              <>
                <ChipInput
                  label="Required skills"
                  value={field.value ?? []}
                  onChange={field.onChange}
                  hint="Press Enter or comma after each skill"
                />
                {facets.data && facets.data.skills.length > 0 && (
                  <div className="tags" role="group" aria-label="Popular skills" style={{ marginBottom: 12 }}>
                    {facets.data.skills
                      .filter((s) => !(field.value ?? []).some((v) => v.toLowerCase() === s.name.toLowerCase()))
                      .slice(0, 8)
                      .map((s) => (
                        <ToggleChip key={s.name} pressed={false} onClick={() => field.onChange([...(field.value ?? []), s.name])}>
                          + {s.name}
                        </ToggleChip>
                      ))}
                  </div>
                )}
              </>
            )}
          />
          <div className="grid-2">
            <TextField label="Salary min" type="number" error={errors.salaryMin?.message} {...register('salaryMin')} />
            <TextField label="Salary max" type="number" error={errors.salaryMax?.message} {...register('salaryMax')} />
            <TextField
              label="Experience required (years)"
              type="number"
              error={errors.experienceRequired?.message}
              {...register('experienceRequired')}
            />
            <TextField label="Vacancies" type="number" error={errors.vacancies?.message} {...register('vacancies')} />
          </div>
        </section>

        {formError && (
          <div className="error" role="alert">
            {formError}
          </div>
        )}
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <Link to="/recruiter/jobs" className="btn btn-ghost">
            Cancel
          </Link>
          <Button type="submit" loading={isSubmitting} disabled={!jobId && !companyId}>
            {jobId ? 'Save changes' : 'Post job'}
          </Button>
        </div>
      </form>
      <aside aria-label="Preview">
        <h2 className="preview-title">How seekers will see it</h2>
        <JobCard job={preview} compact={false} />
      </aside>
    </div>
  );
}

export default function JobFormPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const sourceId = id ? undefined : (params.get('duplicate') ?? undefined);
  const profile = useRecruiterProfile();

  return (
    <div className="container" style={{ maxWidth: 1100 }}>
      <nav aria-label="Breadcrumb" className="muted" style={{ marginBottom: 12, fontSize: 'var(--text-sm)' }}>
        <Link to="/recruiter/jobs">Jobs</Link> / <span aria-current="page">{id ? 'Edit' : 'New'}</span>
      </nav>
      <div className="page-header">
        <h1>{id ? 'Edit job' : sourceId ? 'Duplicate job' : 'Post a new job'}</h1>
      </div>
      <QueryBoundary query={profile} skeleton={<Skeleton height={320} />}>
        {(p) => (
          <>
            {!id && !p.company && (
              <div className="error" role="alert" style={{ marginBottom: 16 }}>
                Create a <Link to="/recruiter/company">company profile</Link> before posting jobs.
              </div>
            )}
            <JobForm jobId={id} sourceId={sourceId} companyId={p.company?.id} companyName={p.company?.name} />
          </>
        )}
      </QueryBoundary>
    </div>
  );
}
