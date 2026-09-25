import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { errorMessage } from '../../shared/api/http';
import { Button } from '../../shared/ui/Button';
import { Dialog } from '../../shared/ui/Dialog';
import { TextArea } from '../../shared/ui/fields';
import { Icon } from '../../shared/ui/Icon';
import { useToast } from '../../shared/ui/toast';
import { useApply } from '../applications/api';
import { useResumeMutations, useSeekerProfile } from '../profile/api';

interface Props {
  open: boolean;
  onClose: () => void;
  jobId: string;
  jobTitle: string;
  companyName?: string;
}

/**
 * Applying needs a resume. If the seeker has none they can add it right here instead of leaving the page,
 * and a successful application shows a confirmation with a link to the tracker.
 */
export default function ApplyDialog({ open, onClose, jobId, jobTitle, companyName }: Props) {
  const profile = useSeekerProfile({ enabled: open });
  const apply = useApply();
  const { upload } = useResumeMutations();
  const toast = useToast();
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const resume = profile.data?.resume;
  const close = () => {
    onClose();
    // Reset once the closing animation is over.
    window.setTimeout(() => {
      setDone(false);
      setError('');
    }, 200);
  };

  const submit = async () => {
    setError('');
    try {
      await apply.mutateAsync({ jobId, coverNote: note.trim() || undefined });
      setDone(true);
      setNote('');
    } catch (err) {
      setError(errorMessage(err, 'Failed to apply'));
    }
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      await upload.mutateAsync(file);
      toast.success('Resume uploaded.');
    } catch (err) {
      setError(errorMessage(err, 'Upload failed'));
    }
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      title={done ? 'Application sent' : `Apply to ${jobTitle}`}
      footer={
        done ? (
          <Button onClick={close}>Done</Button>
        ) : (
          <>
            <Button variant="ghost" onClick={close}>
              Cancel
            </Button>
            <Button loading={apply.isPending} disabled={!resume} icon="send" onClick={submit}>
              Submit application
            </Button>
          </>
        )
      }
    >
      {done ? (
        <div className="empty" style={{ padding: 8 }}>
          <div className="icon-wrap" style={{ background: 'var(--success-soft)', color: 'var(--success)' }}>
            <Icon name="check" />
          </div>
          <h3>Application submitted successfully.</h3>
          <p>{companyName ? `${companyName} will` : 'The recruiter will'} review it. You'll get a notification when the status changes.</p>
          <Link to="/seeker/jobs" onClick={close}>
            Track your applications
          </Link>
        </div>
      ) : (
        <div className="stack">
          <div>
            <div className="label">Resume</div>
            {profile.isPending ? (
              <p className="muted">Checking your resume...</p>
            ) : resume ? (
              <div className="row" style={{ marginTop: 6 }}>
                <Icon name="file" />
                <span className="grow truncate">{resume.originalName}</span>
                <Link to="/seeker/resume" onClick={close}>
                  Change
                </Link>
              </div>
            ) : (
              <div className="card" style={{ marginTop: 6, background: 'var(--surface-2)' }}>
                <p style={{ marginBottom: 8 }}>A resume is required to apply. Add one now (PDF, DOC or DOCX, up to 5MB).</p>
                <input
                  ref={fileInput}
                  type="file"
                  accept=".pdf,.doc,.docx"
                  className="sr-only"
                  id="apply-resume"
                  onChange={(e) => onFile(e.target.files?.[0])}
                />
                <Button variant="secondary" size="sm" icon="upload" loading={upload.isPending} onClick={() => fileInput.current?.click()}>
                  Upload resume
                </Button>
              </div>
            )}
          </div>
          <TextArea
            label="Cover note (optional)"
            rows={4}
            maxLength={2000}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            hint="Tell the recruiter why you're a good fit."
          />
          {error && (
            <div className="error" role="alert">
              {error}
            </div>
          )}
        </div>
      )}
    </Dialog>
  );
}
