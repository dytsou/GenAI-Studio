import { useEffect, useMemo, useRef, useState } from 'react';
import { X, Search, Sparkles, Trash2 } from 'lucide-react';
import {
  deleteMemoryChunk,
  fetchMemoryCandidates,
  fetchMemoryRecent,
  searchMemory,
  type MemoryChunkRow,
} from '../../api/memory';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
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
  const [deleting, setDeleting] = useState<Record<string, boolean>>({});

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
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setLoadingRecent(true);
      setRecentError(null);
    });
    void fetchMemoryRecent({ limit: 12 })
      .then((r) => {
        if (cancelled) return;
        setRecent(r.chunks ?? []);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setRecentError(e instanceof Error ? e.message : t('memoryDrawer.failedToLoadRecent'));
      })
      .finally(() => {
        setLoadingRecent(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, t]);

  useEffect(() => {
    if (!open) return;
    if (!debouncedDraft) {
      abortRef.current?.abort();
      let cancelled = false;
      queueMicrotask(() => {
        if (cancelled) return;
        setCandidates([]);
        setDraftHash(undefined);
        setCandidateError(null);
        setLoadingCandidates(false);
      });
      return () => {
        cancelled = true;
      };
    }
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setLoadingCandidates(true);
      setCandidateError(null);
    });
    void fetchMemoryCandidates({ draftText: debouncedDraft, signal: ac.signal })
      .then((r) => {
        if (cancelled) return;
        setCandidates(r.candidates ?? []);
        setDraftHash(r.draft_hash || undefined);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setCandidateError(e instanceof Error ? e.message : t('memoryDrawer.failedToLoadCandidates'));
      })
      .finally(() => {
        setLoadingCandidates(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, debouncedDraft, t]);

  const runSearch = async () => {
    const q = query.trim();
    if (!q) return;
    setLoadingSearch(true);
    setSearchError(null);
    try {
      const r = await searchMemory({ request: { query: q, pagination: { limit: 20 } } });
      setHits(r.hits ?? []);
    } catch (e: unknown) {
      setSearchError(e instanceof Error ? e.message : t('memoryDrawer.searchFailed'));
    } finally {
      setLoadingSearch(false);
    }
  };

  const refreshRecent = () => {
    setLoadingRecent(true);
    setRecentError(null);
    void fetchMemoryRecent({ limit: 12 })
      .then((r) => setRecent(r.chunks ?? []))
      .catch((e: unknown) => {
        setRecentError(e instanceof Error ? e.message : t('memoryDrawer.failedToLoadRecent'));
      })
      .finally(() => setLoadingRecent(false));
  };

  const refreshCandidates = () => {
    if (!debouncedDraft) return;
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
        setCandidateError(e instanceof Error ? e.message : t('memoryDrawer.failedToLoadCandidates'));
      })
      .finally(() => setLoadingCandidates(false));
  };

  const handleDelete = async (
    chunkId: string,
    origin: 'recent' | 'candidates' | 'search',
  ) => {
    const ok = window.confirm(t('memoryDrawer.deleteConfirm'));
    if (!ok) return;

    // Optimistic remove + selection cleanup.
    if (origin === 'recent')
      setRecent((prev) => prev.filter((c) => c.chunk_id !== chunkId));
    else if (origin === 'candidates')
      setCandidates((prev) => prev.filter((c) => c.chunk_id !== chunkId));
    else setHits((prev) => prev.filter((c) => c.chunk_id !== chunkId));

    setSelection((prev) => {
      if (!(chunkId in prev)) return prev;
      const next = { ...prev };
      delete next[chunkId];
      return next;
    });

    setDeleting((prev) => ({ ...prev, [chunkId]: true }));
    try {
      await deleteMemoryChunk({ chunkId });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : t('memoryDrawer.delete');
      if (origin === 'recent') setRecentError(msg);
      else if (origin === 'candidates') setCandidateError(msg);
      else setSearchError(msg);
    } finally {
      setDeleting((prev) => ({ ...prev, [chunkId]: false }));
      if (origin === 'recent') refreshRecent();
      else if (origin === 'candidates') refreshCandidates();
      else void runSearch();
    }
  };

  const clearSelection = () => {
    setSelection({});
    onOverrideChange(null);
  };

  const isSearching = query.trim().length > 0;
  const list = isSearching ? hits : candidates;
  const emptyLabel = isSearching
    ? t('memoryDrawer.noMatches')
    : t('memoryDrawer.noRelevantMemory');

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
    <div className="memory-drawer-overlay" role="dialog" aria-modal="true" aria-label={t('memoryDrawer.dialogLabel')}>
      <div className="memory-drawer">
        <div className="memory-drawer-header">
          <div className="memory-drawer-title">
            <Sparkles size={16} />
            <span>{t('memoryDrawer.title')}</span>
          </div>
          <button className="memory-drawer-close" onClick={onClose} aria-label={t('memoryDrawer.close')}>
            <X size={16} />
          </button>
        </div>
        <div className="memory-searchbar">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('memoryDrawer.searchPlaceholder')}
            aria-label={t('memoryDrawer.searchAriaLabel')}
          />
          <button
            className="memory-search-btn"
            onClick={() => void runSearch()}
            aria-label={t('memoryDrawer.runSearch')}
            disabled={!query.trim()}
            title={!query.trim() ? t('memoryDrawer.typeQueryToSearch') : t('memoryDrawer.search')}
          >
            <Search size={16} />
          </button>
        </div>

        <div className="memory-drawer-body">
          {!isSearching ? (
            <div className="memory-recent">
              <div className="memory-recent-header">
                <span>{t('memoryDrawer.recentlySaved')}</span>
                <button
                  type="button"
                  className="memory-recent-refresh"
                  onClick={() => {
                    refreshRecent();
                  }}
                  disabled={loadingRecent}
                >
                  {t('memoryDrawer.refresh')}
                </button>
              </div>
              {loadingRecent ? (
                <div className="memory-drawer-state">{t('memoryDrawer.loadingRecent')}</div>
              ) : recentError ? (
                <div className="memory-drawer-state error">{recentError}</div>
              ) : recent.length === 0 ? (
                <div className="memory-drawer-state">{t('memoryDrawer.noSavedMemoryYet')}</div>
              ) : (
                <div className="memory-recent-list">
                  {recent.slice(0, 6).map((c) => (
                    <div key={c.chunk_id} className="memory-recent-row">
                      <div className="memory-recent-keyphrases">{renderKeyphrases(c)}</div>
                      <button
                        type="button"
                        className="memory-row-delete"
                        onClick={() => void handleDelete(c.chunk_id, 'recent')}
                        aria-label={t('memoryDrawer.deleteChunk')}
                        title={t('memoryDrawer.delete')}
                        disabled={!!deleting[c.chunk_id]}
                      >
                        <Trash2 size={14} />
                      </button>
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
            <div className="memory-drawer-state">{t('memoryDrawer.fetchingCandidates')}</div>
          ) : null}
          {!isSearching && candidateError ? (
            <div className="memory-drawer-state error">{candidateError}</div>
          ) : null}
          {isSearching && loadingSearch ? (
            <div className="memory-drawer-state">{t('memoryDrawer.searching')}</div>
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
                  <div key={c.chunk_id} className={`memory-chunk-rowWrap state-${st}`}>
                    <button
                      type="button"
                      className="memory-chunk-row"
                      onClick={() =>
                        setSelection((prev) => ({
                          ...prev,
                          [c.chunk_id]: cycleState(prev[c.chunk_id] ?? 'neutral'),
                        }))
                      }
                      aria-label={`Memory chunk ${c.rank ?? ''} ${st}`}
                      title={t('memoryDrawer.cycleHint')}
                      disabled={!!deleting[c.chunk_id]}
                    >
                      <div className="memory-chunk-top">
                        <span className="memory-chunk-rank">
                          {isSearching
                            ? t('memoryDrawer.searchRank', { rank: c.rank ?? '—' })
                            : t('memoryDrawer.candidateRank', { rank: c.rank ?? '—' })}
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
                    <button
                      type="button"
                      className="memory-row-delete"
                      onClick={() =>
                        void handleDelete(
                          c.chunk_id,
                          isSearching ? 'search' : 'candidates',
                        )
                      }
                      aria-label={t('memoryDrawer.deleteChunk')}
                      title={t('memoryDrawer.delete')}
                      disabled={!!deleting[c.chunk_id]}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="memory-drawer-footer">
          <div className="memory-selection-summary">
            <span>
              {t('memoryDrawer.include')}: <strong>{override.includeChunkIds.length}</strong>
            </span>
            <span>
              {t('memoryDrawer.exclude')}: <strong>{override.excludeChunkIds.length}</strong>
            </span>
          </div>
          <button className="memory-clear-btn" onClick={clearSelection} disabled={!Object.keys(selection).length}>
            {t('memoryDrawer.clear')}
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

