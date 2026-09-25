import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { companyBody, type CompanyBody, type CompanyDTO } from '@jobportal/shared';
import { errorMessage } from '../../shared/api/http';
import { CompanyLogo } from '../../shared/ui/Avatar';
import { Button, LinkButton } from '../../shared/ui/Button';
import { QueryBoundary, Skeleton } from '../../shared/ui/Feedback';
import { TextArea, TextField } from '../../shared/ui/fields';
import { useToast } from '../../shared/ui/toast';
import { useRecruiterProfile, useSaveCompany } from './api';

const blank: CompanyBody = { name: '', description: '', website: '', industry: '', location: '', logoUrl: '' };

function CompanyForm({ company }: { company: CompanyDTO | null }) {
  const toast = useToast();
  const save = useSaveCompany(company?.id);
  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors }
  } = useForm<CompanyBody>({ resolver: zodResolver(companyBody), defaultValues: { ...blank, ...company } });

  useEffect(() => reset({ ...blank, ...company }), [company, reset]);

  const onSubmit = handleSubmit(async (values) => {
    try {
      await save.mutateAsync(values);
      toast.success('Company profile saved.');
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to save company'));
    }
  });

  const name = watch('name');
  const logoUrl = watch('logoUrl');

  return (
    <div className="two-col">
      <form className="card" onSubmit={onSubmit} noValidate>
        <TextField label="Company name" error={errors.name?.message} {...register('name')} />
        <TextArea
          label="Description"
          rows={5}
          hint="What the company does and what it is like to work there."
          {...register('description')}
        />
        <div className="grid-2">
          <TextField label="Industry" {...register('industry')} />
          <TextField label="Location" {...register('location')} />
          <TextField label="Website" type="url" placeholder="https://" error={errors.website?.message} {...register('website')} />
          <TextField label="Logo URL" type="url" placeholder="https://" error={errors.logoUrl?.message} {...register('logoUrl')} />
        </div>
        <Button type="submit" loading={save.isPending}>
          {company ? 'Save changes' : 'Create company'}
        </Button>
      </form>
      <aside className="card">
        <h2>How candidates see you</h2>
        <div className="company-hero" style={{ margin: '12px 0' }}>
          <CompanyLogo name={name} logoUrl={logoUrl || undefined} size="lg" />
          <strong>{name || 'Your company'}</strong>
        </div>
        {company && (
          <LinkButton to={`/companies/${company.id}`} variant="secondary" icon="external">
            View public page
          </LinkButton>
        )}
      </aside>
    </div>
  );
}

export default function CompanyPage() {
  const profile = useRecruiterProfile();
  return (
    <div className="container">
      <div className="page-header">
        <h1>Company profile</h1>
      </div>
      <QueryBoundary query={profile} skeleton={<Skeleton height={320} />}>
        {(p) => <CompanyForm company={p.company} />}
      </QueryBoundary>
    </div>
  );
}
