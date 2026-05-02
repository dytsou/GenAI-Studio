import { useEffect, useMemo, useRef, useState } from 'react';
import { X, Search, Sparkles } from 'lucide-react';
import { fetchMemoryCandidates, searchMemory, type MemoryChunkRow } from '../../api/memory';
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
  const [tab, setTab] = useState<'candidates' | 'search'>('candidates');
  const [selection, setSelection] = useState<Record<string, MemorySelectionState>>({});

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
    if (tab !== 'candidates') return;
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
  }, [open, tab, debouncedDraft]);

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

  const list = tab === 'candidates' ? candidates : hits;
  const emptyLabel =
    tab === 'candidates'
      ? 'No relevant memory found for this draft yet.'
      : 'No matches for this query.';

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

        <div className="memory-drawer-tabs" role="tablist" aria-label="Memory tabs">
          <button
            role="tab"
            aria-selected={tab === 'candidates'}
            className={`memory-tab ${tab === 'candidates' ? 'active' : ''}`}
            onClick={() => setTab('candidates')}
          >
            Candidates
          </button>
          <button
            role="tab"
            aria-selected={tab === 'search'}
            className={`memory-tab ${tab === 'search' ? 'active' : ''}`}
            onClick={() => setTab('search')}
          >
            Search
          </button>
        </div>

        {tab === 'search' ? (
          <div className="memory-searchbar">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search memory…"
              aria-label="Search memory"
            />
            <button className="memory-search-btn" onClick={() => void runSearch()} aria-label="Run memory search">
              <Search size={16} />
            </button>
          </div>
        ) : null}

        <div className="memory-drawer-body">
          {tab === 'candidates' && loadingCandidates ? (
            <div className="memory-drawer-state">Fetching candidates…</div>
          ) : null}
          {tab === 'candidates' && candidateError ? (
            <div className="memory-drawer-state error">{candidateError}</div>
          ) : null}
          {tab === 'search' && loadingSearch ? (
            <div className="memory-drawer-state">Searching…</div>
          ) : null}
          {tab === 'search' && searchError ? (
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
                      <span className="memory-chunk-rank">#{c.rank ?? '—'}</span>
                      <span className="memory-chunk-bucket">{c.relevance_bucket ?? ''}</span>
                      <span className="memory-chunk-time">{new Date(c.created_at).toLocaleString()}</span>
                    </div>
                    <div className="memory-chunk-preview">{c.preview}</div>
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

