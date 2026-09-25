import type { Types } from 'mongoose';
import { deleteFile } from '../../infra/storage/resumeStorage';
import { logger } from '../../infra/logger';
import * as applications from '../../repositories/application.repository';
import * as resumes from '../../repositories/resume.repository';

/**
 * After applications are deleted (admin cascades), resumes the owner had already removed ("archived") and that
 * nothing references any more are deleted, bytes included. Runs after the transaction commits.
 */
export async function deleteResumesIfOrphaned(ids: Types.ObjectId[]): Promise<void> {
  for (const id of new Set(ids.filter(Boolean).map(String))) {
    const resume = await resumes.findById(id);
    if (!resume?.archivedAt || (await applications.resumeIsReferenced(resume._id))) continue;
    await resumes.deleteById(resume._id);
    await deleteFile(resume.fileId).catch((err) => logger.warn({ err, resumeId: id }, 'could not delete resume file'));
  }
}

/** Account deletion: every resume the user owns, metadata and bytes. */
export async function deleteAllResumesOf(ownerId: Types.ObjectId): Promise<void> {
  for (const resume of await resumes.listAllForOwner(ownerId)) {
    await resumes.deleteById(resume._id);
    await deleteFile(resume.fileId).catch((err) => logger.warn({ err, resumeId: String(resume._id) }, 'could not delete resume file'));
  }
}
