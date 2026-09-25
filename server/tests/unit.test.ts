import { ALLOWED_TRANSITIONS, APPLICATION_STATUSES, isTerminalStatus, isValidTransition, jobListQuery } from '@jobportal/shared';
import { Types } from 'mongoose';
import { heuristicMatch, verdictFor } from '../src/modules/matching/heuristic';
import { afterCursor, encodeCursor, parseSort } from '../src/utils/cursor';
import { detectResumeType, extractDocxText, inspectResume, sanitizeFilename } from '../src/utils/fileInspection';
import { PDF, makeDocx } from './helpers';

describe('application status workflow (pure rules)', () => {
  test('the documented transition table', () => {
    expect(ALLOWED_TRANSITIONS).toEqual({
      APPLIED: ['SHORTLISTED', 'REJECTED'],
      SHORTLISTED: ['INTERVIEW', 'REJECTED'],
      INTERVIEW: ['SELECTED', 'REJECTED'],
      SELECTED: [],
      REJECTED: []
    });
  });

  test('no status may move to itself, backwards, or out of a final state', () => {
    for (const from of APPLICATION_STATUSES) {
      expect(isValidTransition(from, from)).toBe(false);
      expect(isValidTransition(from, 'APPLIED')).toBe(false);
    }
    expect(isTerminalStatus('SELECTED')).toBe(true);
    expect(isTerminalStatus('REJECTED')).toBe(true);
    expect(isTerminalStatus('INTERVIEW')).toBe(false);
  });
});

describe('query contract', () => {
  test('defaults and parsing', () => {
    const q = jobListQuery.parse({ skills: 'React, node.js,React', employmentType: 'REMOTE,FULL_TIME', experience: '3' });
    expect(q).toMatchObject({
      page: 1,
      limit: 20,
      sort: '-createdAt',
      skills: ['React', 'node.js'],
      employmentType: ['REMOTE', 'FULL_TIME'],
      experience: 3
    });
  });

  test('empty strings mean "not provided"', () => {
    expect(jobListQuery.parse({ title: '', page: '', limit: '', sort: '' })).toMatchObject({ page: 1, limit: 20, sort: '-createdAt' });
  });
});

describe('file inspection', () => {
  test('detects types from bytes', () => {
    expect(detectResumeType(PDF)).toBe('pdf');
    expect(detectResumeType(makeDocx(['x']))).toBe('docx');
    expect(detectResumeType(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0]))).toBe('doc');
    expect(detectResumeType(Buffer.from('MZ executable'))).toBeNull();
  });

  test('rejects mismatches and hashes accepted files', () => {
    expect(inspectResume(PDF, 'a.docx')).toEqual({ reason: 'EXTENSION_MISMATCH', detected: 'pdf' });
    const ok = inspectResume(PDF, 'My CV.PDF');
    expect(ok).toMatchObject({ extension: 'pdf', safeName: 'My CV.pdf', mimeType: 'application/pdf' });
    expect((ok as { sha256: string }).sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  test('sanitises names', () => {
    expect(sanitizeFilename('../../x/../evil.pdf', 'pdf')).toBe('evil.pdf');
    expect(sanitizeFilename('  ..hidden.pdf  ', 'pdf')).toBe('hidden.pdf');
    expect(sanitizeFilename('résumé 2026.docx', 'docx')).toBe('résumé 2026.docx');
    expect(sanitizeFilename('', 'doc')).toBe('resume.doc');
    expect(sanitizeFilename(`${'a'.repeat(300)}.pdf`, 'pdf')).toHaveLength(104);
  });

  test('extracts DOCX text and survives garbage', () => {
    expect(extractDocxText(makeDocx(['Line one', 'A &amp; B']))).toBe('Line one\nA & B');
    expect(extractDocxText(Buffer.from('PK\x03\x04 broken'))).toBeNull();
  });
});

describe('keyset cursor', () => {
  test('round trip for descending salary', () => {
    const sort = parseSort('-salaryMax');
    const id = new Types.ObjectId();
    const cursor = encodeCursor(sort, { _id: id, salaryMax: 5000 });
    expect(afterCursor(sort, cursor)).toEqual({ $or: [{ salaryMax: { $lt: 5000 } }, { salaryMax: 5000, _id: { $lt: id } }] });
  });

  test('ascending dates use $gt', () => {
    const sort = parseSort('createdAt');
    const at = new Date('2026-01-01T00:00:00Z');
    const filter = afterCursor(sort, encodeCursor(sort, { _id: new Types.ObjectId(), createdAt: at })) as {
      $or: Array<Record<string, unknown>>;
    };
    expect(filter.$or[0]).toEqual({ createdAt: { $gt: at } });
  });
});

describe('heuristic matcher', () => {
  const base = {
    job: {
      title: 'x',
      location: 'y',
      employmentType: 'FULL_TIME',
      experienceRequired: 4,
      requiredSkills: ['C++', 'Node.js'],
      description: ''
    },
    candidate: { skills: ['c++'], totalExperienceYears: 2, experience: [], education: [] },
    resume: { kind: 'text' as const, text: 'Built services in Node.js' }
  };

  test('matches listed skills and skills mentioned in the resume text, and weighs experience', () => {
    const out = heuristicMatch(base);
    expect(out.matchedSkills).toEqual(['C++', 'Node.js']);
    expect(out.score).toBe(85); // 0.7 * 1 + 0.3 * 0.5
    expect(out.gaps.join(' ')).toMatch(/2 years of experience against 4/);
  });

  test('derives years from dated roles when not stated', () => {
    const out = heuristicMatch({
      ...base,
      candidate: { ...base.candidate, totalExperienceYears: null, experience: [{ from: '2020-01-01', to: '2024-01-01' }] }
    });
    expect(out.candidateYearsOfExperience).toBe(4);
  });

  test('verdict bands', () => {
    expect([verdictFor(95), verdictFor(60), verdictFor(40), verdictFor(10)]).toEqual(['STRONG', 'GOOD', 'PARTIAL', 'WEAK']);
  });
});
