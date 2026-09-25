import { useRef, useState } from 'react';
import { errorMessage } from '../../shared/api/http';
import { formatDate } from '../../shared/lib/format';
import { Button } from '../../shared/ui/Button';
import { EmptyState, QueryBoundary } from '../../shared/ui/Feedback';
import { ConfirmDialog } from '../../shared/ui/Dialog';
import { useToast } from '../../shared/ui/toast';
import { downloadMyResume, useResumeMutations, useSeekerProfile } from './api';

export default function ResumePage() {
  const profile = useSeekerProfile();
  const { upload, remove } = useResumeMutations();
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const attempt = async (action: () => Promise<unknown>, done?: string) => {
    try {
      await action();
      if (done) toast.success(done);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <div className="container" style={{ maxWidth: 720 }} id="resume">
      <div className="page-header">
        <div>
          <h1>My resume</h1>
          <p>A resume is required before you can apply to jobs.</p>
        </div>
      </div>
      <QueryBoundary query={profile}>
        {(p) => (
          <div className="stack">
            <section className="card" aria-labelledby="current-title">
              <h2 id="current-title">Current resume</h2>
              {p.resume ? (
                <div className="row-between">
                  <div>
                    <strong>{p.resume.originalName}</strong>
                    <div className="faint" style={{ fontSize: 'var(--text-sm)' }}>
                      Uploaded {formatDate(p.resume.uploadedAt)}
                    </div>
                  </div>
                  <div className="row">
                    <Button variant="secondary" icon="download" onClick={() => attempt(() => downloadMyResume(p.resume!.originalName))}>
                      Download
                    </Button>
                    <Button variant="danger-outline" icon="trash" onClick={() => setConfirmDelete(true)}>
                      Delete
                    </Button>
                  </div>
                </div>
              ) : (
                <EmptyState icon="file" title="No resume uploaded yet">
                  Upload a PDF, DOC or DOCX below.
                </EmptyState>
              )}
            </section>

            <form
              className="card"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!file) return;
                await attempt(() => upload.mutateAsync(file), 'Resume uploaded.');
                setFile(null);
                if (input.current) input.current.value = '';
              }}
            >
              <h2>{p.resume ? 'Replace resume' : 'Upload resume'}</h2>
              <div className="field">
                <label htmlFor="resume-file">Resume file (PDF, DOC, DOCX, max 5 MB)</label>
                <input
                  id="resume-file"
                  ref={input}
                  type="file"
                  accept=".pdf,.doc,.docx"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </div>
              <Button type="submit" icon="upload" loading={upload.isPending} disabled={!file}>
                Upload
              </Button>
            </form>

            <ConfirmDialog
              open={confirmDelete}
              danger
              title="Delete resume?"
              message="You will not be able to apply to jobs until you upload a new one."
              confirmLabel="Delete"
              loading={remove.isPending}
              onCancel={() => setConfirmDelete(false)}
              onConfirm={async () => {
                await attempt(() => remove.mutateAsync(), 'Resume deleted.');
                setConfirmDelete(false);
              }}
            />
          </div>
        )}
      </QueryBoundary>
    </div>
  );
}
