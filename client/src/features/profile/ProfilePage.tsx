import { useEffect } from 'react';
import { Controller, useFieldArray, useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
import type { SeekerProfileDTO } from '@jobportal/shared';
import { errorMessage } from '../../shared/api/http';
import { Button } from '../../shared/ui/Button';
import { Icon } from '../../shared/ui/Icon';
import { QueryBoundary } from '../../shared/ui/Feedback';
import { TextArea, TextField } from '../../shared/ui/fields';
import { useToast } from '../../shared/ui/toast';
import { useAuth } from '../auth/AuthContext';
import { Avatar } from '../../shared/ui/Avatar';
import { useSaveSeekerProfile, useSeekerProfile } from './api';
import ChipInput from './ChipInput';
import { profileCompleteness } from './completeness';

interface FormValues {
  headline: string;
  phone: string;
  address: string;
  totalExperienceYears: string;
  skills: string[];
  education: Array<{ degree: string; institution: string; fieldOfStudy: string; grade: string; startYear: string; endYear: string }>;
  experience: Array<{ title: string; company: string; description: string }>;
}

const str = (v: unknown): string => (v === undefined || v === null ? '' : String(v));

function toForm(p: SeekerProfileDTO): FormValues {
  return {
    headline: str(p.headline),
    phone: str(p.phone),
    address: str(p.address),
    totalExperienceYears: str(p.totalExperienceYears),
    skills: p.skills,
    education: p.education.map((e) => ({
      degree: str(e.degree),
      institution: str(e.institution),
      fieldOfStudy: str(e.fieldOfStudy),
      grade: str(e.grade),
      startYear: str(e.startYear),
      endYear: str(e.endYear)
    })),
    experience: p.experience.map((e) => ({ title: str(e.title), company: str(e.company), description: str(e.description) }))
  };
}

function CompletenessCard({ profile }: { profile: SeekerProfileDTO }) {
  const { percent, items } = profileCompleteness(profile);
  return (
    <aside className="card" aria-labelledby="completeness-title">
      <h2 id="completeness-title">Profile strength</h2>
      <div className="row-between" style={{ marginBottom: 8 }}>
        <span className="muted">{percent === 100 ? 'All set' : 'Keep going'}</span>
        <strong className="num">{percent}%</strong>
      </div>
      <div
        className="meter"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Profile completeness"
      >
        <span style={{ width: `${percent}%` }} />
      </div>
      <ul className="checklist" style={{ marginTop: 16 }}>
        {items.map((i) => (
          <li key={i.key} className={i.done ? 'done' : ''}>
            <Icon name={i.done ? 'check' : 'plus'} />
            {i.done ? (
              i.doneLabel
            ) : i.key === 'resume' ? (
              <Link to="/seeker/resume">{i.label}</Link>
            ) : (
              <a href={`#${i.anchor}`}>{i.label}</a>
            )}
          </li>
        ))}
      </ul>
    </aside>
  );
}

function ProfileForm({ profile }: { profile: SeekerProfileDTO }) {
  const toast = useToast();
  const save = useSaveSeekerProfile();
  const { register, control, handleSubmit, reset, formState } = useForm<FormValues>({ defaultValues: toForm(profile) });
  const education = useFieldArray({ control, name: 'education' });
  const experience = useFieldArray({ control, name: 'experience' });

  useEffect(() => reset(toForm(profile)), [profile, reset]);

  const onSubmit = handleSubmit(async (v) => {
    try {
      await save.mutateAsync({
        headline: v.headline,
        phone: v.phone,
        address: v.address,
        // "" clears the value; the API validates the range (0-60).
        totalExperienceYears: v.totalExperienceYears === '' ? null : Number(v.totalExperienceYears),
        skills: v.skills,
        education: v.education.map((e) => ({
          degree: e.degree,
          institution: e.institution,
          fieldOfStudy: e.fieldOfStudy,
          grade: e.grade,
          startYear: e.startYear ? Number(e.startYear) : undefined,
          endYear: e.endYear ? Number(e.endYear) : undefined
        })),
        experience: v.experience
      });
      toast.success('Profile saved.');
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to save'));
    }
  });

  return (
    <form onSubmit={onSubmit} className="stack">
      <section className="card" id="about" aria-labelledby="about-title">
        <h2 id="about-title">About you</h2>
        <TextField label="Headline" placeholder="e.g. Full-stack developer" {...register('headline')} />
        <div className="grid-2">
          <TextField label="Phone" type="tel" autoComplete="tel" {...register('phone')} />
          <TextField label="Location" autoComplete="address-level2" {...register('address')} />
        </div>
        <TextField
          label="Total years of experience"
          type="number"
          min={0}
          max={60}
          step={0.5}
          inputMode="decimal"
          hint="Used to match you with a job's experience requirement."
          {...register('totalExperienceYears')}
        />
      </section>

      <section className="card" id="skills" aria-labelledby="skills-title">
        <h2 id="skills-title">Skills</h2>
        <Controller
          control={control}
          name="skills"
          render={({ field }) => (
            <ChipInput label="Add skills" value={field.value} onChange={field.onChange} hint="Press Enter or comma after each skill" />
          )}
        />
      </section>

      <section className="card" id="experience" aria-labelledby="exp-title">
        <div className="card-header">
          <h2 id="exp-title">Experience</h2>
          <Button variant="secondary" size="sm" icon="plus" onClick={() => experience.append({ title: '', company: '', description: '' })}>
            Add experience
          </Button>
        </div>
        {experience.fields.length === 0 && <p className="muted">No experience added yet.</p>}
        {experience.fields.map((field, i) => (
          <fieldset key={field.id}>
            <legend>Experience {i + 1}</legend>
            <div className="grid-2">
              <TextField label="Title" {...register(`experience.${i}.title`)} />
              <TextField label="Company" {...register(`experience.${i}.company`)} />
            </div>
            <TextArea label="Description" rows={3} {...register(`experience.${i}.description`)} />
            <Button variant="danger-outline" size="sm" icon="trash" onClick={() => experience.remove(i)}>
              Remove
            </Button>
          </fieldset>
        ))}
      </section>

      <section className="card" id="education" aria-labelledby="edu-title">
        <div className="card-header">
          <h2 id="edu-title">Education</h2>
          <Button
            variant="secondary"
            size="sm"
            icon="plus"
            onClick={() => education.append({ degree: '', institution: '', fieldOfStudy: '', grade: '', startYear: '', endYear: '' })}
          >
            Add education
          </Button>
        </div>
        {education.fields.length === 0 && <p className="muted">No education added yet.</p>}
        {education.fields.map((field, i) => (
          <fieldset key={field.id}>
            <legend>Education {i + 1}</legend>
            <div className="grid-2">
              <TextField label="Degree" {...register(`education.${i}.degree`)} />
              <TextField label="Institution" {...register(`education.${i}.institution`)} />
              <TextField label="Field of study" {...register(`education.${i}.fieldOfStudy`)} />
              <TextField label="Grade" {...register(`education.${i}.grade`)} />
              <TextField label="Start year" type="number" {...register(`education.${i}.startYear`)} />
              <TextField label="End year" type="number" {...register(`education.${i}.endYear`)} />
            </div>
            <Button variant="danger-outline" size="sm" icon="trash" onClick={() => education.remove(i)}>
              Remove
            </Button>
          </fieldset>
        ))}
      </section>

      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <Button type="submit" loading={save.isPending} disabled={!formState.isDirty}>
          Save profile
        </Button>
      </div>
    </form>
  );
}

export default function ProfilePage() {
  const profile = useSeekerProfile();
  const { user } = useAuth();
  return (
    <div className="container">
      <div className="page-header">
        <div className="row">
          <Avatar name={user?.name} size="xl" />
          <div>
            <h1>{user?.name ?? 'My profile'}</h1>
            <p>{profile.data?.headline || 'Add a headline so recruiters know who you are.'}</p>
          </div>
        </div>
      </div>
      <QueryBoundary query={profile}>
        {(p) => (
          <div className="two-col">
            <ProfileForm profile={p} />
            <CompletenessCard profile={p} />
          </div>
        )}
      </QueryBoundary>
    </div>
  );
}
