import './StreamStatsBar.css';

export type StreamStatsBarProps = {
  promptTokens: number;
  contextWindowTokens: number;
  completionTokens: number;
  maxOutputTokens: number;
  tokensPerSecond: number | null;
  active: boolean;
  /** Last `studio_meta` from hosted gateway SSE (Intelligent routing), if any. */
  studioChosenModel?: string | null;
  studioMemoryTokensUsed?: number | null;
};

function formatPercent(used: number, cap: number): string {
  if (cap <= 0) return '0%';
  const pct = (used / cap) * 100;
  if (pct < 0.1 && pct > 0) return '<0.1%';
  return `${Math.floor(pct)}%`;
}

function formatOutputCap(max: number): string {
  if (max <= 0 || max >= 1_000_000) return '∞';
  return String(max);
}

export function StreamStatsBar({
  promptTokens,
  contextWindowTokens,
  completionTokens,
  maxOutputTokens,
  tokensPerSecond,
  active,
  studioChosenModel,
  studioMemoryTokensUsed,
}: StreamStatsBarProps) {
  const tpsLabel =
    tokensPerSecond != null && Number.isFinite(tokensPerSecond) ? `${tokensPerSecond.toFixed(1)} t/s` : '—';

  const showStudioMeta =
    (studioChosenModel != null && studioChosenModel !== '') ||
    (studioMemoryTokensUsed != null && Number.isFinite(studioMemoryTokensUsed));

  return (
    <div
      className={`stream-stats-bar ${active ? 'stream-stats-bar--active' : ''}`}
      aria-live="polite"
      aria-label="Streaming token statistics"
    >
      <span className="stream-stats-item">
        <span className="stream-stats-label">Context:</span>{' '}
        <span className="stream-stats-value">
          {Math.round(promptTokens)}/{contextWindowTokens} ({formatPercent(promptTokens, contextWindowTokens)})
        </span>
      </span>
      <span className="stream-stats-sep" aria-hidden />
      <span className="stream-stats-item">
        <span className="stream-stats-label">Output:</span>{' '}
        <span className="stream-stats-value">
          {Math.round(completionTokens)}/{formatOutputCap(maxOutputTokens)}
        </span>
      </span>
      <span className="stream-stats-sep" aria-hidden />
      <span className="stream-stats-item">
        <span className="stream-stats-value stream-stats-tps">{tpsLabel}</span>
      </span>
      {showStudioMeta ? (
        <>
          <span className="stream-stats-sep" aria-hidden />
          {studioChosenModel ? (
            <span className="stream-stats-item" title="Model reported by gateway (intelligent routing)">
              <span className="stream-stats-label">Gateway:</span>{' '}
              <span className="stream-stats-value">{studioChosenModel}</span>
            </span>
          ) : null}
          {studioMemoryTokensUsed != null && Number.isFinite(studioMemoryTokensUsed) ? (
            <span className="stream-stats-item" title="Long-term memory tokens used for this reply">
              <span className="stream-stats-label">Mem:</span>{' '}
              <span className="stream-stats-value">{Math.round(studioMemoryTokensUsed)}</span>
            </span>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
