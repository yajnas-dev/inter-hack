import type { Readable } from 'node:stream';
import { Types } from 'mongoose';
import type { ResumeDTO } from '@jobportal/shared';
import { deleteFile, openFile, putFile } from '../../infra/storage/resumeStorage';
import { logger } from '../../infra/logger';
import { NotFoundError, UnsupportedMediaTypeError, ValidationError } from '../../http/errors';
import { assertCanReadResume } from '../../policies/access';
import * as applications from '../../repositories/application.repository';
import * as profiles from '../../repositories/profile.repository';
import * as resumes from '../../repositories/resume.repository';
import { extractDocxText, inspectResume } from '../../utils/fileInspection';
import { presentResume } from '../../utils/presenters';

type User = Express.AuthUser;

const FAILURES = {
  EMPTY: () => new ValidationError([{ location: 'file', field: 'file', message: 'The file is empty' }]),
  BAD_EXTENSION: () => new UnsupportedMediaTypeError('Only PDF, DOC and DOCX resumes are accepted'),
  UNRECOGNISED_CONTENT: () => new UnsupportedMediaTypeError('The file is not a readable PDF, DOC or DOCX document'),
  EXTENSION_MISMATCH: () => new UnsupportedMediaTypeError("The file's content does not match its extension"),
  MACROS: () => new UnsupportedMediaTypeError('Macro-enabled Word documents are not accepted')
} as const;

/**
 * Upload pipeline: bytes are sniffed (magic numbers) and must agree with the extension; the name is sanitised;
 * the client's Content-Type is ignored. The new resume becomes the current one. The previous one is deleted
 * unless an application still references it (recruiters must keep seeing exactly what was sent).
 */
export async function upload(user: User, file: Express.Multer.File): Promise<ResumeDTO> {
  const inspected = inspectResume(file.buffer, file.originalname);
  if ('reason' in inspected) throw FAILURES[inspected.reason]();

  const fileId = await putFile(file.buffer, { filename: inspected.safeName, contentType: inspected.mimeType, ownerId: user.id });
  const text = inspected.extension === 'docx' ? extractDocxText(file.buffer) : null;

  let resume: Awaited<ReturnType<typeof resumes.create>>;
  try {
    resume = await resumes.create({
      owner: new Types.ObjectId(user.id),
      fileId,
      originalName: inspected.safeName,
      mimeType: inspected.mimeType,
      size: file.size,
      sha256: inspected.sha256,
      ...(text && { text })
    });
  } catch (err) {
    await deleteFile(fileId); // no orphaned bytes if the metadata write fails
    throw err;
  }

  const previous = await profiles.setCurrentResume(user.id, resume._id);
  if (previous && String(previous) !== String(resume._id)) await removeIfUnreferenced(previous);
  return presentResume(resume, resume._id);
}

async function removeIfUnreferenced(resumeId: Types.ObjectId): Promise<void> {
  const old = await resumes.findById(resumeId);
  if (!old) return;
  if (await applications.resumeIsReferenced(old._id)) return;
  await resumes.deleteById(old._id);
  await deleteFile(old.fileId).catch((err) => logger.warn({ err, fileId: String(old.fileId) }, 'could not delete resume file'));
}

export async function listMine(user: User): Promise<ResumeDTO[]> {
  const [rows, profile] = await Promise.all([resumes.listForOwner(user.id), profiles.findSeeker(user.id)]);
  return rows.map((r) => presentResume(r, profile?.resume ?? null));
}

export async function get(user: User, id: string): Promise<ResumeDTO> {
  const resume = await assertCanReadResume(user, await resumes.findById(id));
  return presentResume(resume);
}

export interface Download {
  stream: Readable;
  filename: string;
  mimeType: string;
  size: number;
}

/** Streams the file after the authorisation check. Never cached by browsers or proxies. */
export async function download(user: User, id: string): Promise<Download> {
  const resume = await assertCanReadResume(user, await resumes.findById(id));
  const stream = await openFile(resume.fileId);
  if (!stream) throw new NotFoundError('Resume file');
  logger.info({ resumeId: id, by: user.id, role: user.role }, 'resume downloaded');
  return { stream, filename: resume.originalName, mimeType: resume.mimeType, size: resume.size };
}

/**
 * Owner only. If applications reference it, the file is kept for those recruiters but hidden from the owner's
 * list; otherwise the metadata and bytes are deleted.
 */
export async function remove(user: User, id: string): Promise<void> {
  const resume = await resumes.findById(id);
  if (!resume || String(resume.owner) !== user.id || resume.archivedAt) throw new NotFoundError('Resume');

  await profiles.clearCurrentResumeIf(user.id, resume._id);
  if (await applications.resumeIsReferenced(resume._id)) {
    await resumes.archive(resume._id);
    return;
  }
  await resumes.deleteById(resume._id);
  await deleteFile(resume.fileId);
}
