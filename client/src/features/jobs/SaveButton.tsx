import { useNavigate } from 'react-router-dom';
import { IconButton } from '../../shared/ui/Button';
import { useAuth } from '../auth/AuthContext';

/** Bookmark toggle. Guests are sent to sign in; recruiters and admins never see it. */
export default function SaveButton({
  jobId,
  saved,
  onToggle,
  size = 'sm',
  from
}: {
  jobId: string;
  saved: boolean;
  onToggle: (jobId: string) => void;
  size?: 'sm' | 'md';
  from?: string;
}) {
  const { user } = useAuth();
  const navigate = useNavigate();
  if (user && user.role !== 'JOB_SEEKER') return null;

  return (
    <IconButton
      icon="bookmark"
      size={size}
      label={saved ? 'Remove from saved jobs' : 'Save job'}
      aria-pressed={saved}
      className={saved ? 'saved' : ''}
      style={saved ? { color: 'var(--brand)' } : undefined}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!user) navigate('/login', { state: { from: from ?? '/jobs' } });
        else onToggle(jobId);
      }}
    />
  );
}
