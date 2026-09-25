import { type ChangeEvent, type FormEvent, useId, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { registerBody } from '@jobportal/shared';
import { AuthTabs } from '@/components/ui/modern-animated-sign-in';
import { errorMessage } from '../../shared/api/http';
import { AuthLayout } from './AuthLayout';
import { useAuth } from './AuthContext';

export default function RegisterPage() {
  const { register: signUp } = useAuth();
  const navigate = useNavigate();
  const roleId = useId();
  const [values, setValues] = useState({ role: 'JOB_SEEKER', name: '', email: '', password: '' });
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const set = (key: 'name' | 'email' | 'password') => (event: ChangeEvent<HTMLInputElement>) =>
    setValues((v) => ({ ...v, [key]: event.target.value }));

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError('');
    const parsed = registerBody.safeParse(values);
    if (!parsed.success) return setFormError(parsed.error.issues[0]?.message ?? 'Check your details');
    setSubmitting(true);
    try {
      const user = await signUp(parsed.data);
      navigate(user.role === 'RECRUITER' ? '/recruiter/company' : '/jobs', { replace: true });
    } catch (err) {
      setFormError(errorMessage(err, 'Registration failed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout>
      <AuthTabs
        formFields={{
          header: 'Create your account',
          subHeader: 'Find a job, or hire your next teammate.',
          extra: (
            <div className="flex flex-col gap-2">
              <label htmlFor={roleId} className="text-sm font-medium leading-none text-neutral-800 dark:text-neutral-200">
                I am a
              </label>
              <select
                id={roleId}
                name="role"
                value={values.role}
                onChange={(e) => setValues((v) => ({ ...v, role: e.target.value }))}
                className="shadow-input h-10 w-full rounded-md bg-gray-50 px-3 text-sm text-black focus-visible:outline-none focus-visible:ring-[2px] focus-visible:ring-neutral-500 dark:bg-zinc-800 dark:text-white"
              >
                <option value="JOB_SEEKER">Job Seeker</option>
                <option value="RECRUITER">Recruiter</option>
              </select>
            </div>
          ),
          fields: [
            { label: 'Name', required: true, type: 'text', placeholder: 'Your full name', autoComplete: 'name', onChange: set('name') },
            {
              label: 'Email',
              required: true,
              type: 'email',
              placeholder: 'you@example.com',
              autoComplete: 'email',
              onChange: set('email')
            },
            {
              label: 'Password',
              required: true,
              type: 'password',
              placeholder: 'At least 8 characters',
              autoComplete: 'new-password',
              onChange: set('password')
            }
          ],
          submitButton: 'Register',
          textVariantButton: 'Already have an account? Sign in',
          errorField: formError,
          minPasswordLength: 8,
          submitting
        }}
        goTo={() => navigate('/login')}
        handleSubmit={handleSubmit}
      />
    </AuthLayout>
  );
}
