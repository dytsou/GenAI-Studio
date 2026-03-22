import './StreamStatsBar.css';

export type StreamStatsBarProps = {
  promptTokens: number;
  contextWindowTokens: number;
  completionTokens: number;
  maxOutputTokens: number;
  tokensPerSecond: number | null;
  active: boolean;
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
}: StreamStatsBarProps) {
  const tpsLabel =
    tokensPerSecond != null && Number.isFinite(tokensPerSecond) ? `${tokensPerSecond.toFixed(1)} t/s` : '—';

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
    </div>
  );
}
