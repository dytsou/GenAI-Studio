import { useEffect, useRef, useState } from 'react';
import { X, Paperclip, ChevronRight } from 'lucide-react';
import type { Attachment } from '../../stores/useChatStore';
import type { QueuedSend } from './queuedSendTypes';
import { processFile } from '../../utils/attachmentManager';
import { useTranslation } from 'react-i18next';
import './ComposerQueuedList.css';

type ComposerQueuedListProps = {
  items: QueuedSend[];
  onUpdate: (
    id: string,
    patch: Partial<Pick<QueuedSend, 'content' | 'attachments' | 'promptOverride'>>,
  ) => void;
  onRemove: (id: string) => void;
  onAppendAttachments: (id: string, attachments: Attachment[]) => void;
};

export function ComposerQueuedList({
  items,
  onUpdate,
  onRemove,
  onAppendAttachments,
}: ComposerQueuedListProps) {
  const { t } = useTranslation();
  const queueFileInputRef = useRef<HTMLInputElement>(null);
  const attachForIdRef = useRef<string | null>(null);
  const [isProcessingFile, setIsProcessingFile] = useState(false);
  const [listExpanded, setListExpanded] = useState(true);
  const prevCountRef = useRef(0);

  useEffect(() => {
    if (items.length > prevCountRef.current) {
      setListExpanded(true);
    }
    prevCountRef.current = items.length;
  }, [items.length]);

  const previewText = (text: string, max = 72) => {
    const t = text.trim().replace(/\s+/g, ' ');
    if (t.length <= max) return t || '…';
    return `${t.slice(0, max)}…`;
  };

  const openAttachFor = (id: string) => {
    attachForIdRef.current = id;
    queueFileInputRef.current?.click();
  };

  const handleQueueFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const id = attachForIdRef.current;
    attachForIdRef.current = null;
    if (!id || !e.target.files || e.target.files.length === 0) return;

    setIsProcessingFile(true);
    try {
      const newAttachments: Attachment[] = [];
      for (let i = 0; i < e.target.files.length; i++) {
        const file = e.target.files[i];
        const processed = await processFile(file);
        newAttachments.push(...processed);
      }
      onAppendAttachments(id, newAttachments);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to process file';
      alert(message);
    } finally {
      setIsProcessingFile(false);
      if (queueFileInputRef.current) queueFileInputRef.current.value = '';
    }
  };

  if (items.length === 0) return null;

  const panelId = 'composer-queued-panel';

  return (
    <div className="composer-queued-toggle" aria-label={t('queue.panelLabel')}>
      <input
        type="file"
        ref={queueFileInputRef}
        onChange={handleQueueFileChange}
        style={{ display: 'none' }}
        accept="image/jpeg, image/png, image/gif, image/webp, application/pdf"
        multiple
      />
      <button
        type="button"
        className="composer-queued-toggle-header"
        onClick={() => setListExpanded((e) => !e)}
        aria-expanded={listExpanded}
        aria-controls={panelId}
        id="composer-queued-toggle-button"
      >
        <ChevronRight
          size={18}
          className={`composer-queued-chevron ${listExpanded ? 'composer-queued-chevron--open' : ''}`}
          aria-hidden
        />
        <span className="composer-queued-toggle-title">
          {t('queue.title')}
          <span className="composer-queued-toggle-count">({items.length})</span>
        </span>
      </button>
      {!listExpanded && (
        <p className="composer-queued-collapsed-preview" aria-live="polite">
          {items.slice(0, 2).map((it, i) => (
            <span key={it.id}>
              {i > 0 ? ' · ' : ''}
              {previewText(it.content, 48) ||
                (it.attachments.length > 0
                  ? t('queue.attachmentsCount', { count: it.attachments.length })
                  : '…')}
            </span>
          ))}
          {items.length > 2 ? ` · ${t('queue.more', { count: items.length - 2 })}` : ''}
        </p>
      )}
      <div
        id={panelId}
        role="region"
        aria-labelledby="composer-queued-toggle-button"
        hidden={!listExpanded}
        className="composer-queued-list"
      >
      {items.map((item, index) => (
        <div key={item.id} className="composer-queued-item">
          <div className="composer-queued-item-header">
            <span className="composer-queued-item-label">
              {t('queue.queuedItem', { index: index + 1, total: items.length })}
            </span>
            <button
              type="button"
              className="composer-queued-item-remove"
              onClick={() => onRemove(item.id)}
              title={t('queue.removeFromQueue')}
              aria-label={t('queue.removeQueuedAria', { index: index + 1 })}
            >
              <X size={16} />
            </button>
          </div>
          <textarea
            className="composer-queued-textarea"
            value={item.content}
            onChange={(e) => onUpdate(item.id, { content: e.target.value })}
            placeholder={t('queue.messagePlaceholder')}
            rows={2}
            disabled={isProcessingFile}
          />
          {item.attachments.length > 0 && (
            <div className="composer-queued-attachments">
              {item.attachments.map((att, idx) => (
                <div key={`${item.id}-att-${idx}`} className="composer-attachment-item">
                  <img src={att.dataUrl} alt={att.name} />
                  <button
                    type="button"
                    className="remove-att-btn"
                    onClick={() =>
                      onUpdate(item.id, {
                        attachments: item.attachments.filter((_, i) => i !== idx),
                      })
                    }
                    title={t('queue.removeAttachment')}
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="composer-queued-item-tools">
            <button
              type="button"
              className="attach-btn composer-queued-attach"
              onClick={() => openAttachFor(item.id)}
              disabled={isProcessingFile}
              title={t('queue.attachQueued')}
            >
              <Paperclip size={18} />
            </button>
            <input
              type="text"
              className="composer-queued-override-input"
              value={item.promptOverride ?? ''}
              onChange={(e) => {
                const v = e.target.value;
                onUpdate(item.id, { promptOverride: v ? v : undefined });
              }}
              placeholder={t('queue.overridePlaceholder')}
              disabled={isProcessingFile}
            />
          </div>
        </div>
      ))}
      {isProcessingFile && (
        <div className="processing-indicator">{t('queue.processingQueue')}</div>
      )}
      </div>
    </div>
  );
}
