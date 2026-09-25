import type { MatchAnalysisDTO } from '@jobportal/shared';
import type { UseMutationResult } from '@tanstack/react-query';
import { errorMessage } from '../../shared/api/http';
import { Button } from '../../shared/ui/Button';
import { Icon } from '../../shared/ui/Icon';

const VERDICT_LABEL: Record<MatchAnalysisDTO['verdict'], string> = {
  STRONG: 'Strong fit',
  GOOD: 'Good fit',
  PARTIAL: 'Partial fit',
  WEAK: 'Weak fit'
};

function List({ title, items, tone }: { title: string; items: string[]; tone?: 'good' | 'gap' }) {
  if (!items.length) return null;
  return (
    <div className="match-list">
      <h4>{title}</h4>
      <ul className={tone ? `tone-${tone}` : undefined}>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Resume <-> job analysis. The server decides the engine: the AI model when configured, otherwise (or when
 * the model fails) a rule-based estimate, which is labelled as such.
 */
export default function MatchPanel({
  mutation,
  audience
}: {
  mutation: UseMutationResult<MatchAnalysisDTO, unknown, void>;
  audience: 'seeker' | 'recruiter';
}) {
  const result = mutation.data;
  const cta = audience === 'seeker' ? 'Analyse my fit' : 'Analyse fit';

  return (
    <section className="match-panel" aria-labelledby="match-panel-title" aria-busy={mutation.isPending}>
      <div className="row-between">
        <h3 id="match-panel-title" className="row" style={{ margin: 0 }}>
          <Icon name="sparkle" /> {audience === 'seeker' ? 'How well do you fit?' : 'Resume fit'}
        </h3>
        <Button size="sm" variant={result ? 'secondary' : 'primary'} loading={mutation.isPending} onClick={() => mutation.mutate()}>
          {result ? 'Re-analyse' : cta}
        </Button>
      </div>

      {!result && !mutation.isError && (
        <p className="faint" style={{ margin: 0 }}>
          {audience === 'seeker'
            ? 'Compares your resume and profile with this job: matched and missing skills, experience, and how to strengthen your application.'
            : "Compares the resume this candidate sent and their profile with the job's requirements."}
        </p>
      )}

      {mutation.isError && (
        <p role="alert" className="match-error">
          {errorMessage(mutation.error, 'The analysis could not be run. Try again in a moment.')}
        </p>
      )}

      {result && (
        <div className="match-result" aria-live="polite">
          <div className="match-score">
            <div
              className={`score-ring verdict-${result.verdict.toLowerCase()}`}
              role="img"
              aria-label={`Fit score ${result.score} out of 100`}
            >
              <span>{result.score}</span>
            </div>
            <div>
              <strong>{VERDICT_LABEL[result.verdict]}</strong>
              <div className="faint">
                {result.engine === 'ai' ? `AI analysis${result.cached ? ' (saved)' : ''}` : 'Rule-based estimate'}
                {' · '}
                {result.experience.candidateYears ?? '?'} of {result.experience.requiredYears} years
              </div>
            </div>
          </div>
          <p style={{ margin: 0 }}>{result.summary}</p>

          {(result.matchedSkills.length > 0 || result.missingSkills.length > 0) && (
            <div className="tags">
              {result.matchedSkills.map((s) => (
                <span key={`m-${s}`} className="tag tag-have">
                  {s}
                </span>
              ))}
              {result.missingSkills.map((s) => (
                <span key={`x-${s}`} className="tag tag-missing">
                  {s} (missing)
                </span>
              ))}
            </div>
          )}

          <div className="match-grid">
            <List title="Strengths" items={result.strengths} tone="good" />
            <List title="Gaps" items={result.gaps} tone="gap" />
          </div>
          {audience === 'seeker' && <List title="Improve your application" items={result.suggestions} />}

          {result.warnings.length > 0 && (
            <ul className="match-warnings">
              {result.warnings.map((w) => (
                <li key={w}>
                  <Icon name="info" /> {w}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
