import { useEffect, useMemo, useRef, useState } from 'react';
import { X, Search, Sparkles } from 'lucide-react';
import { fetchMemoryCandidates, fetchMemoryRecent, searchMemory, type MemoryChunkRow } from '../../api/memory';
import './MemoryDrawer.css';

export type MemorySelectionState = 'neutral' | 'include' | 'exclude';

export type MemoryOverrideDraft = {
  includeChunkIds: string[];
  excludeChunkIds: string[];
  draftHash?: string;
};

function cycleState(s: MemorySelectionState): MemorySelectionState {
  if (s === 'neutral') return 'include';
  if (s === 'include') return 'exclude';
  return 'neutral';
}

function deriveOverride(selection: Record<string, MemorySelectionState>, draftHash?: string): MemoryOverrideDraft {
  const includeChunkIds: string[] = [];
  const excludeChunkIds: string[] = [];
  for (const [id, st] of Object.entries(selection)) {
    if (st === 'include') includeChunkIds.push(id);
    else if (st === 'exclude') excludeChunkIds.push(id);
  }
  return { includeChunkIds, excludeChunkIds, draftHash };
}

export function MemoryDrawer(props: {
  open: boolean;
  onClose: () => void;
  draftText: string;
  onOverrideChange: (ov: MemoryOverrideDraft | null) => void;
}) {
  const { open, onClose, draftText, onOverrideChange } = props;
  const [selection, setSelection] = useState<Record<string, MemorySelectionState>>({});

  const [recent, setRecent] = useState<MemoryChunkRow[]>([]);
  const [loadingRecent, setLoadingRecent] = useState(false);
  const [recentError, setRecentError] = useState<string | null>(null);

  const [candidates, setCandidates] = useState<MemoryChunkRow[]>([]);
  const [draftHash, setDraftHash] = useState<string | undefined>(undefined);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [candidateError, setCandidateError] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<MemoryChunkRow[]>([]);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const debouncedDraft = useDebouncedValue(draftText.trim(), 550);
  const abortRef = useRef<AbortController | null>(null);

  const override = useMemo(() => deriveOverride(selection, draftHash), [selection, draftHash]);

  useEffect(() => {
    if (!open) return;
    onOverrideChange(
      override.includeChunkIds.length || override.excludeChunkIds.length ? override : null,
    );
  }, [open, override, onOverrideChange]);

  useEffect(() => {
    if (!open) return;
    setLoadingRecent(true);
    setRecentError(null);
    void fetchMemoryRecent({ limit: 12 })
      .then((r) => setRecent(r.chunks ?? []))
      .catch((e: unknown) => {
        setRecentError(e instanceof Error ? e.message : 'Failed to load recent');
      })
      .finally(() => setLoadingRecent(false));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (!debouncedDraft) {
      setCandidates([]);
      setDraftHash(undefined);
      setCandidateError(null);
      return;
    }
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setLoadingCandidates(true);
    setCandidateError(null);
    void fetchMemoryCandidates({ draftText: debouncedDraft, signal: ac.signal })
      .then((r) => {
        setCandidates(r.candidates ?? []);
        setDraftHash(r.draft_hash || undefined);
      })
      .catch((e: unknown) => {
        setCandidateError(e instanceof Error ? e.message : 'Failed to load candidates');
      })
      .finally(() => setLoadingCandidates(false));
  }, [open, debouncedDraft]);

  const runSearch = async () => {
    const q = query.trim();
    if (!q) return;
    setLoadingSearch(true);
    setSearchError(null);
    try {
      const r = await searchMemory({ request: { query: q, pagination: { limit: 20 } } });
      setHits(r.hits ?? []);
    } catch (e: unknown) {
      setSearchError(e instanceof Error ? e.message : 'Search failed');
    } finally {
      setLoadingSearch(false);
    }
  };

  const clearSelection = () => {
    setSelection({});
    onOverrideChange(null);
  };

  const isSearching = query.trim().length > 0;
  const list = isSearching ? hits : candidates;
  const emptyLabel = isSearching
    ? 'No matches for this query.'
    : 'No relevant memory found for this draft yet.';

  const renderKeyphrases = (c: MemoryChunkRow) => {
    const phrases = Array.isArray(c.keyphrases) ? c.keyphrases.filter(Boolean) : [];
    if (!phrases.length) return <span className="memory-keyphrase-fallback">{c.preview}</span>;
    return phrases.slice(0, 12).map((k) => (
      <span key={`${c.chunk_id}:${k}`} className="memory-keyphrase">
        {k}
      </span>
    ));
  };

  if (!open) return null;

  return (
    <div className="memory-drawer-overlay" role="dialog" aria-modal="true" aria-label="Memory selection">
      <div className="memory-drawer">
        <div className="memory-drawer-header">
          <div className="memory-drawer-title">
            <Sparkles size={16} />
            <span>Memory</span>
          </div>
          <button className="memory-drawer-close" onClick={onClose} aria-label="Close memory drawer">
            <X size={16} />
          </button>
        </div>
        <div className="memory-searchbar">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search memory… (leave empty to show candidates)"
            aria-label="Search memory"
          />
          <button
            className="memory-search-btn"
            onClick={() => void runSearch()}
            aria-label="Run memory search"
            disabled={!query.trim()}
            title={!query.trim() ? 'Type a query to search' : 'Search'}
          >
            <Search size={16} />
          </button>
        </div>

        <div className="memory-drawer-body">
          {!isSearching ? (
            <div className="memory-recent">
              <div className="memory-recent-header">
                <span>Recently saved</span>
                <button
                  type="button"
                  className="memory-recent-refresh"
                  onClick={() => {
                    setLoadingRecent(true);
                    setRecentError(null);
                    void fetchMemoryRecent({ limit: 12 })
                      .then((r) => setRecent(r.chunks ?? []))
                      .catch((e: unknown) => {
                        setRecentError(e instanceof Error ? e.message : 'Failed to load recent');
                      })
                      .finally(() => setLoadingRecent(false));
                  }}
                  disabled={loadingRecent}
                >
                  Refresh
                </button>
              </div>
              {loadingRecent ? (
                <div className="memory-drawer-state">Loading recent…</div>
              ) : recentError ? (
                <div className="memory-drawer-state error">{recentError}</div>
              ) : recent.length === 0 ? (
                <div className="memory-drawer-state">No saved memory yet.</div>
              ) : (
                <div className="memory-recent-list">
                  {recent.slice(0, 6).map((c) => (
                    <div key={c.chunk_id} className="memory-recent-row">
                      <div className="memory-recent-keyphrases">{renderKeyphrases(c)}</div>
                      <div className="memory-recent-meta">
                        <span>{new Date(c.created_at).toLocaleString()}</span>
                        <span>{(c.tags ?? []).slice(0, 2).join(', ')}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}

          {!isSearching && loadingCandidates ? (
            <div className="memory-drawer-state">Fetching candidates…</div>
          ) : null}
          {!isSearching && candidateError ? (
            <div className="memory-drawer-state error">{candidateError}</div>
          ) : null}
          {isSearching && loadingSearch ? (
            <div className="memory-drawer-state">Searching…</div>
          ) : null}
          {isSearching && searchError ? (
            <div className="memory-drawer-state error">{searchError}</div>
          ) : null}

          {list.length === 0 && !(loadingCandidates || loadingSearch) ? (
            <div className="memory-drawer-state">{emptyLabel}</div>
          ) : (
            <div className="memory-chunk-list">
              {list.map((c) => {
                const st = selection[c.chunk_id] ?? 'neutral';
                return (
                  <button
                    key={c.chunk_id}
                    className={`memory-chunk-row state-${st}`}
                    onClick={() =>
                      setSelection((prev) => ({
                        ...prev,
                        [c.chunk_id]: cycleState(prev[c.chunk_id] ?? 'neutral'),
                      }))
                    }
                    aria-label={`Memory chunk ${c.rank ?? ''} ${st}`}
                    title="Click to cycle: include → exclude → neutral"
                  >
                    <div className="memory-chunk-top">
                      <span className="memory-chunk-rank">
                        {isSearching ? `#${c.rank ?? '—'}` : `Candidate #${c.rank ?? '—'}`}
                      </span>
                      <span className="memory-chunk-bucket">{c.relevance_bucket ?? ''}</span>
                      <span className="memory-chunk-time">{new Date(c.created_at).toLocaleString()}</span>
                    </div>
                    <div className="memory-chunk-keyphrases">{renderKeyphrases(c)}</div>
                    <div className="memory-chunk-tags">
                      {(c.tags ?? []).slice(0, 6).map((t) => (
                        <span key={t} className="memory-tag">
                          {t}
                        </span>
                      ))}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="memory-drawer-footer">
          <div className="memory-selection-summary">
            <span>
              Include: <strong>{override.includeChunkIds.length}</strong>
            </span>
            <span>
              Exclude: <strong>{override.excludeChunkIds.length}</strong>
            </span>
          </div>
          <button className="memory-clear-btn" onClick={clearSelection} disabled={!Object.keys(selection).length}>
            Clear
          </button>
        </div>
      </div>
    </div>
  );
}

function useDebouncedValue<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return v;
}

