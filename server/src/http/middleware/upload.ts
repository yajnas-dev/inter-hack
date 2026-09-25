import multer from 'multer';
import { badRequest } from '../errors';

const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
];

/** Resumes are buffered (5MB cap) then streamed into GridFS by the service. */
export const resumeUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) return cb(badRequest('Only PDF, DOC, or DOCX files are allowed'));
    cb(null, true);
  }
});
