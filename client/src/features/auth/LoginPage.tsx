import { type ChangeEvent, type FormEvent, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { type Role, loginBody } from '@jobportal/shared';
import { AuthTabs } from '@/components/ui/modern-animated-sign-in';
import { errorMessage } from '../../shared/api/http';
import { AuthLayout } from './AuthLayout';
import { useAuth } from './AuthContext';

export const homeFor = (role: Role): string => (role === 'RECRUITER' ? '/recruiter' : role === 'ADMIN' ? '/admin/dashboard' : '/jobs');

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const from = (useLocation().state as { from?: string } | null)?.from;
  const [values, setValues] = useState({ email: '', password: '' });
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const set = (key: 'email' | 'password') => (event: ChangeEvent<HTMLInputElement>) =>
    setValues((v) => ({ ...v, [key]: event.target.value }));

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError('');
    const parsed = loginBody.safeParse(values);
    if (!parsed.success) return setFormError(parsed.error.issues[0]?.message ?? 'Check your details');
    setSubmitting(true);
    try {
      const user = await login(parsed.data);
      navigate(from ?? homeFor(user.role), { replace: true });
    } catch (err) {
      setFormError(errorMessage(err, 'Login failed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout>
      <AuthTabs
        formFields={{
          header: 'Welcome back',
          subHeader: 'Sign in to continue.',
          fields: [
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
              placeholder: 'Your password',
              autoComplete: 'current-password',
              onChange: set('password'),
              name: 'password'
            }
          ],
          submitButton: 'Login',
          textVariantButton: 'New here? Create an account',
          errorField: formError,
          minPasswordLength: 1,
          submitting
        }}
        goTo={() => navigate('/register')}
        handleSubmit={handleSubmit}
      />
    </AuthLayout>
  );
}
