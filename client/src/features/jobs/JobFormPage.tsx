import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { EMPLOYMENT_TYPES, jobCreateBody, jobUpdateBody } from '@jobportal/shared';
import { errorMessage } from '../../shared/api/http';
import { employmentLabel } from '../../shared/lib/format';
import { Button } from '../../shared/ui/Button';
import { QueryBoundary, Skeleton } from '../../shared/ui/Feedback';
import { SelectField, TextArea, TextField } from '../../shared/ui/fields';
import { useToast } from '../../shared/ui/toast';
import { useRecruiterProfile } from '../profile/api';
import ChipInput from '../profile/ChipInput';
import { useJob, useJobMutations } from './api';

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

function JobForm({ jobId, sourceId, companyId }: { jobId?: string; sourceId?: string; companyId?: string }) {
  const navigate = useNavigate();
  const toast = useToast();
  const { create, update } = useJobMutations();
  const existing = useJob(jobId ?? sourceId);
  const [formError, setFormError] = useState('');
  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting }
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { employmentType: 'FULL_TIME', vacancies: 1, requiredSkills: [] }
  });

  useEffect(() => {
    const job = existing.data;
    if (job) reset({ ...job, title: sourceId ? `${job.title} (copy)` : job.title, requiredSkills: job.requiredSkills });
  }, [existing.data, sourceId, reset]);

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
            <ChipInput
              label="Required skills"
              value={field.value ?? []}
              onChange={field.onChange}
              hint="Press Enter or comma after each skill"
            />
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
  );
}

export default function JobFormPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const sourceId = id ? undefined : (params.get('duplicate') ?? undefined);
  const profile = useRecruiterProfile();

  return (
    <div className="container" style={{ maxWidth: 800 }}>
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
            <JobForm jobId={id} sourceId={sourceId} companyId={p.company?.id} />
          </>
        )}
      </QueryBoundary>
    </div>
  );
}
