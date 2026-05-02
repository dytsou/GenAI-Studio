import { useState, useRef, useEffect } from 'react';
import { Send, Square, Paperclip, X, Sparkles, Mic, BookOpen } from 'lucide-react';
import type { Attachment } from '../../stores/useChatStore';
import type { QueuedSend } from './queuedSendTypes';
import { ComposerQueuedList } from './ComposerQueuedList';
import { processFile } from '../../utils/attachmentManager';
import { useSettingsStore } from '../../stores/useSettingsStore';
import { transcribeAudio } from '../../api/transcribe';
import type { MemoryOverrideDraft } from './MemoryDrawer';
import { MemoryDrawer } from './MemoryDrawer';
import './Composer.css';

interface ComposerProps {
  onSend: (
    content: string,
    attachments: Attachment[],
    systemPromptOverride?: string,
    memoryOverride?: MemoryOverrideDraft | null,
  ) => void;
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
  const settings = useSettingsStore();
  const [content, setContent] = useState('');
  const [systemPromptOverride, setSystemPromptOverride] = useState('');
  const [isSystemOverrideEnabled, setIsSystemOverrideEnabled] = useState(false);
  const [memoryDrawerOpen, setMemoryDrawerOpen] = useState(false);
  const [memoryOverride, setMemoryOverride] = useState<MemoryOverrideDraft | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isProcessingFile, setIsProcessingFile] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<BlobPart[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [content]);

  useEffect(() => {
    return () => {
      const mr = mediaRecorderRef.current;
      if (mr && mr.state !== 'inactive') mr.stop();
      mediaRecorderRef.current = null;
    };
  }, []);

  const handleSend = () => {
    if (!content.trim() && attachments.length === 0) return;
    const override = isSystemOverrideEnabled ? systemPromptOverride.trim() : '';
    onSend(content, attachments, override || undefined, memoryOverride);
    setContent('');
    setSystemPromptOverride('');
    setIsSystemOverrideEnabled(false);
    setMemoryOverride(null);
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

  const startRecording = async () => {
    if (!settings.useHostedGateway || isGenerating) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const mr = new MediaRecorder(stream);
      mediaRecorderRef.current = mr;
      mr.ondataavailable = (ev) => {
        if (ev.data.size > 0) audioChunksRef.current.push(ev.data);
      };
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
      };
      mr.start();
      setIsRecording(true);
    } catch (e) {
      console.error(e);
      alert('Microphone access failed.');
    }
  };

  const finishRecordingAndTranscribe = async () => {
    const mr = mediaRecorderRef.current;
    if (!mr) return;
    await new Promise<void>((resolve) => {
      mr.addEventListener('stop', () => resolve(), { once: true });
      if (mr.state !== 'inactive') mr.stop();
    });
    mediaRecorderRef.current = null;
    setIsRecording(false);
    const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
    audioChunksRef.current = [];
    if (blob.size < 100) return;
    setIsTranscribing(true);
    try {
      const text = await transcribeAudio(blob);
      setContent((prev) => (prev ? `${prev}\n${text}` : text));
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : 'Transcription failed');
    } finally {
      setIsTranscribing(false);
    }
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
        {settings.useHostedGateway && (
          <button
            type="button"
            className={`composer-system-toggle-btn ${memoryDrawerOpen ? 'active' : ''}`}
            onClick={() => setMemoryDrawerOpen(true)}
            disabled={isProcessingFile}
            title="Select memory for this send"
            aria-label="Select memory for this send"
          >
            <BookOpen size={14} />
          </button>
        )}
        {settings.useHostedGateway && (
          <button
            type="button"
            className={`composer-mic-btn ${isRecording ? 'active' : ''}`}
            onClick={() => (isRecording ? void finishRecordingAndTranscribe() : void startRecording())}
            disabled={isGenerating || isTranscribing || isProcessingFile}
            title={isRecording ? 'Stop and transcribe' : 'Record voice (gateway)'}
            aria-label="Voice transcription"
          >
            <Mic size={14} />
          </button>
        )}
      </div>
      {settings.useHostedGateway && settings.useIntelligentMode && (
        <div className="composer-intelligent-memory" aria-label="Intelligent memory tiers">
          <span className="composer-intelligent-label">Memory:</span>
          <label>
            <input
              type="checkbox"
              checked={settings.intelligentIncludeSessionMemory}
              onChange={(e) =>
                settings.setSettings({ intelligentIncludeSessionMemory: e.target.checked })
              }
            />{' '}
            Session
          </label>
          <label>
            <input
              type="checkbox"
              checked={settings.intelligentIncludeGlobalMemory}
              onChange={(e) =>
                settings.setSettings({ intelligentIncludeGlobalMemory: e.target.checked })
              }
            />{' '}
            Global
          </label>
          <label>
            <input
              type="checkbox"
              checked={settings.intelligentRevealMemoryUi}
              onChange={(e) => settings.setSettings({ intelligentRevealMemoryUi: e.target.checked })}
            />{' '}
            Reveal values
          </label>
        </div>
      )}
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
        {(isProcessingFile || isTranscribing) && (
          <div className="processing-indicator">
            {isTranscribing ? 'Transcribing…' : 'Processing attachments...'}
          </div>
        )}
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

      <MemoryDrawer
        open={memoryDrawerOpen}
        onClose={() => setMemoryDrawerOpen(false)}
        draftText={content}
        onOverrideChange={setMemoryOverride}
      />
    </div>
  );
}
