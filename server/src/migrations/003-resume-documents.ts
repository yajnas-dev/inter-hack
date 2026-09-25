// Moves resume metadata out of profiles/applications into the Resume collection, and backfills
// Company.nameLower. Idempotent: rows already converted (ObjectId references) are skipped.
import crypto from 'node:crypto';
import mongoose, { type Types } from 'mongoose';
import { Application, Company, JobSeekerProfile, Resume } from '../models';

interface EmbeddedResume {
  fileId: Types.ObjectId;
  originalName?: string;
  mimeType?: string;
  size?: number;
  uploadedAt?: Date;
}

const isEmbedded = (v: unknown): v is EmbeddedResume => Boolean(v && typeof v === 'object' && 'fileId' in (v as object));

async function sha256Of(fileId: Types.ObjectId): Promise<string> {
  const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db!, { bucketName: 'resumes' });
  const hash = crypto.createHash('sha256');
  try {
    for await (const chunk of bucket.openDownloadStream(fileId)) hash.update(chunk as Buffer);
  } catch {
    return '0'.repeat(64); // bytes missing: keep the row so references stay valid
  }
  return hash.digest('hex');
}

const MIME = new Set(['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']);

async function resumeFor(owner: Types.ObjectId, meta: EmbeddedResume): Promise<Types.ObjectId> {
  const existing = await Resume.collection.findOne({ fileId: meta.fileId }, { projection: { _id: 1 } });
  if (existing) return existing._id as Types.ObjectId;
  const now = meta.uploadedAt ?? new Date();
  const { insertedId } = await Resume.collection.insertOne({
    owner,
    fileId: meta.fileId,
    originalName: (meta.originalName ?? 'resume').slice(0, 120),
    mimeType: MIME.has(meta.mimeType ?? '') ? meta.mimeType : 'application/pdf',
    size: Math.max(1, meta.size ?? 1),
    sha256: await sha256Of(meta.fileId),
    createdAt: now,
    updatedAt: now
  });
  return insertedId as Types.ObjectId;
}

export const resumeDocuments = {
  name: '003-resume-documents',
  async up(): Promise<void> {
    for await (const p of JobSeekerProfile.collection.find({ 'resume.fileId': { $exists: true } })) {
      if (!isEmbedded(p.resume)) continue;
      const id = await resumeFor(p.user as Types.ObjectId, p.resume);
      await JobSeekerProfile.collection.updateOne({ _id: p._id }, { $set: { resume: id } });
    }

    for await (const a of Application.collection.find({ 'resumeSnapshot.fileId': { $exists: true } })) {
      if (!isEmbedded(a.resumeSnapshot)) continue;
      const id = await resumeFor(a.applicant as Types.ObjectId, a.resumeSnapshot);
      await Application.collection.updateOne({ _id: a._id }, { $set: { resume: id }, $unset: { resumeSnapshot: '' } });
    }

    for await (const c of Company.collection.find({ nameLower: { $exists: false } }, { projection: { name: 1 } })) {
      await Company.collection.updateOne({ _id: c._id }, { $set: { nameLower: String(c.name ?? '').toLowerCase() } });
    }
  }
};
