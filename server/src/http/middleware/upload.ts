import type { RequestHandler } from 'express';
import multer from 'multer';
import { RESUME_MAX_BYTES } from '@jobportal/shared';
import { extensionOf, isAllowedExtension } from '../../utils/fileInspection';
import { AppError, BadRequestError, UnsupportedMediaTypeError } from '../errors';

/**
 * Multipart parsing for resume uploads: exactly one part named "file", no other fields, 5 MB cap, buffered in
 * memory (never written to a temp path). The extension is pre-checked here to reject obvious junk before
 * buffering; the real type check (magic bytes) happens in the resume service.
 */
const parser = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: RESUME_MAX_BYTES, files: 1, fields: 0, parts: 2, fieldNameSize: 32, headerPairs: 20 },
  fileFilter: (_req, file, cb) => {
    if (!isAllowedExtension(extensionOf(file.originalname))) {
      return cb(
        new UnsupportedMediaTypeError('Only PDF, DOC and DOCX resumes are accepted', [
          { location: 'file', field: 'file', message: 'File extension must be .pdf, .doc or .docx' }
        ])
      );
    }
    cb(null, true);
  }
}).single('file');

export const resumeUpload: RequestHandler = (req, res, next) => {
  if (!req.is('multipart/form-data')) {
    return next(new UnsupportedMediaTypeError('Upload the resume as multipart/form-data with a single "file" part'));
  }
  parser(req, res, (err?: unknown) => {
    // Limit errors (multer) and our own errors keep their meaning; anything else is the multipart parser
    // rejecting a malformed body, which is the client's fault (400), not a server error.
    if (err)
      return next(err instanceof multer.MulterError || err instanceof AppError ? err : new BadRequestError('Malformed multipart body'));
    if (!req.file)
      return next(
        new BadRequestError('No file uploaded: send it in the multipart field "file"', [
          { location: 'file', field: 'file', message: 'Required' }
        ])
      );
    next();
  });
};
