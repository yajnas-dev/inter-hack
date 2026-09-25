import { Schema, model, type Types } from 'mongoose';
import { RESUME_MIME_TYPES } from '@jobportal/shared';

/**
 * Metadata for one uploaded resume file. The bytes live in the private GridFS bucket "resumes"; nothing here
 * is publicly addressable. Resumes are immutable: uploading a new one creates a new document, so an
 * application always points at exactly the file that was sent.
 */
export interface ResumeAttrs {
  _id: Types.ObjectId;
  owner: Types.ObjectId;
  /** GridFS file id. Internal: never sent to clients. */
  fileId: Types.ObjectId;
  /** Sanitised client filename (display only). */
  originalName: string;
  /** Detected from the file's bytes, not from the upload's Content-Type. */
  mimeType: string;
  size: number;
  sha256: string;
  /** Plain text extracted at upload (DOCX only) for AI matching. Private. */
  text?: string;
  /** Set when the owner removed it while applications still reference it: kept for recruiters, hidden from the owner's list. */
  archivedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const resumeSchema = new Schema<ResumeAttrs>(
  {
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    fileId: { type: Schema.Types.ObjectId, required: true },
    originalName: { type: String, required: true, maxlength: 120 },
    mimeType: { type: String, required: true, enum: Object.values(RESUME_MIME_TYPES) },
    size: { type: Number, required: true, min: 1 },
    sha256: { type: String, required: true, match: /^[a-f0-9]{64}$/ },
    text: { type: String, select: false, maxlength: 60_000 },
    archivedAt: Date
  },
  { timestamps: true, autoIndex: false }
);

resumeSchema.index({ owner: 1, createdAt: -1 });
resumeSchema.index({ fileId: 1 }, { unique: true });

export const Resume = model<ResumeAttrs>('Resume', resumeSchema);
