import { idParam } from '@jobportal/shared';
import { authedController } from '../../http/controller';
import { attachment, created, noContent, ok, stream } from '../../http/respond';
import * as resumes from './resumes.service';

export const upload = authedController({}, async ({ user, req }) => {
  // resumeUpload middleware guarantees req.file.
  const resume = await resumes.upload(user, req.file as Express.Multer.File);
  return created(resume, `/api/v1/resumes/${resume.id}`, 'Resume uploaded');
});

export const listMine = authedController({}, async ({ user }) => ok(await resumes.listMine(user)));

export const getOne = authedController({ params: idParam }, async ({ user, params }) => ok(await resumes.get(user, params.id)));

export const download = authedController({ params: idParam }, async ({ user, params }) => {
  const file = await resumes.download(user, params.id);
  return stream(file.stream, {
    'Content-Type': file.mimeType,
    'Content-Length': String(file.size),
    'Content-Disposition': attachment(file.filename),
    // Private document: no shared/proxy caching, never rendered as active content.
    'Cache-Control': 'private, no-store',
    'Content-Security-Policy': "default-src 'none'; sandbox",
    'X-Content-Type-Options': 'nosniff'
  });
});

export const remove = authedController({ params: idParam }, async ({ user, params }) => {
  await resumes.remove(user, params.id);
  return noContent();
});
