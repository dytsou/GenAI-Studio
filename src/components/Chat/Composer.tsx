import { useState, useRef, useEffect } from 'react';
import { Send, Square, Paperclip, X, Sparkles } from 'lucide-react';
import type { Attachment } from '../../stores/useChatStore';
import type { QueuedSend } from './queuedSendTypes';
import { ComposerQueuedList } from './ComposerQueuedList';
import { processFile } from '../../utils/attachmentManager';
import './Composer.css';

interface ComposerProps {
  onSend: (content: string, attachments: Attachment[], systemPromptOverride?: string) => void;
  onStop: () => void;
  isGenerating: boolean;
  sendQueue: QueuedSend[];
  onUpdateQueuedSend: (
    id: string,
    patch: Partial<Pick<QueuedSend, 'content' | 'attachments' | 'promptOverride'>>,
  ) => void;
  onRemoveQueuedSend: (id: string) => void;
  onAppendAttachmentsToQueued: (id: string, attachments: Attachment[]) => void;
}

export function Composer({
  onSend,
  onStop,
  isGenerating,
  sendQueue,
  onUpdateQueuedSend,
  onRemoveQueuedSend,
  onAppendAttachmentsToQueued,
}: ComposerProps) {
  const [content, setContent] = useState('');
  const [systemPromptOverride, setSystemPromptOverride] = useState('');
  const [isSystemOverrideEnabled, setIsSystemOverrideEnabled] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isProcessingFile, setIsProcessingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [content]);

  const handleSend = () => {
    if (!content.trim() && attachments.length === 0) return;
    const override = isSystemOverrideEnabled ? systemPromptOverride.trim() : '';
    onSend(content, attachments, override || undefined);
    setContent('');
    setSystemPromptOverride('');
    setIsSystemOverrideEnabled(false);
    setAttachments([]);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    setIsProcessingFile(true);
    try {
      const newAttachments: Attachment[] = [];
      for (let i = 0; i < e.target.files.length; i++) {
        const file = e.target.files[i];
        const processed = await processFile(file);
        newAttachments.push(...processed);
      }
      setAttachments(prev => [...prev, ...newAttachments]);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to process file';
      alert(message);
    } finally {
      setIsProcessingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="composer-shell">
      <div className="composer-tools-row">
        <button
          type="button"
          className={`composer-system-toggle-btn ${isSystemOverrideEnabled ? 'active' : ''}`}
          onClick={() => setIsSystemOverrideEnabled(prev => !prev)}
          disabled={isProcessingFile}
          title="Toggle per-message system override"
          aria-label="Toggle per-message system override"
        >
          <Sparkles size={14} />
        </button>
      </div>
      <div className="composer-container">
        <ComposerQueuedList
          items={sendQueue}
          onUpdate={onUpdateQueuedSend}
          onRemove={onRemoveQueuedSend}
          onAppendAttachments={onAppendAttachmentsToQueued}
        />
        {attachments.length > 0 && (
          <div className="composer-attachments">
            {attachments.map((att, idx) => (
              <div key={idx} className="composer-attachment-item">
                <img src={att.dataUrl} alt={att.name} />
                <button 
                  className="remove-att-btn" 
                  onClick={() => removeAttachment(idx)}
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
        
        <div className="composer-input-row">
          <button 
            className="attach-btn" 
            onClick={() => fileInputRef.current?.click()}
            disabled={isProcessingFile}
            title="Attach Image or PDF"
          >
            <Paperclip size={20} />
          </button>
          <input 
            type="file" 
            ref={fileInputRef}
            onChange={handleFileChange}
            style={{ display: 'none' }}
            accept="image/jpeg, image/png, image/gif, image/webp, application/pdf"
            multiple
          />

          <textarea
            ref={textareaRef}
            className="composer-textarea"
            value={content}
            onChange={e => setContent(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything..."
            rows={1}
            disabled={isProcessingFile}
          />

          <div className="composer-actions">
            {isGenerating && (
              <button
                type="button"
                className="stop-btn"
                onClick={onStop}
                title="Stop generation and clear queued messages"
              >
                <Square size={20} fill="currentColor" />
              </button>
            )}
            <button
              type="button"
              className="send-btn"
              onClick={handleSend}
              disabled={(!content.trim() && attachments.length === 0) || isProcessingFile}
              title={
                isGenerating
                  ? 'Add message to queue (sent after this reply finishes)'
                  : 'Send'
              }
            >
              <Send size={20} />
            </button>
          </div>
        </div>
        {isProcessingFile && <div className="processing-indicator">Processing attachments...</div>}
      </div>
      {isSystemOverrideEnabled && (
        <div className="composer-system-override-row">
          <input
            type="text"
            className="composer-system-override-input"
            value={systemPromptOverride}
            onChange={e => setSystemPromptOverride(e.target.value)}
            placeholder="System override (this message only)"
            disabled={isProcessingFile}
          />
        </div>
      )}
    </div>
  );
}
