import { useState, useRef, useEffect } from 'react';
import { Send, Square, Paperclip, X } from 'lucide-react';
import type { Attachment } from '../../stores/useChatStore';
import { processFile } from '../../utils/attachmentManager';
import './Composer.css';

interface ComposerProps {
  onSend: (content: string, attachments: Attachment[]) => void;
  onStop: () => void;
  isGenerating: boolean;
}

export function Composer({ onSend, onStop, isGenerating }: ComposerProps) {
  const [content, setContent] = useState('');
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
    if ((!content.trim() && attachments.length === 0) || isGenerating) return;
    onSend(content, attachments);
    setContent('');
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
    } catch (err: any) {
      alert(err.message || 'Failed to process file');
    } finally {
      setIsProcessingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="composer-container">
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
          disabled={isGenerating || isProcessingFile}
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
          disabled={isGenerating || isProcessingFile}
        />

        {isGenerating ? (
          <button className="stop-btn" onClick={onStop} title="Stop generation">
            <Square size={20} fill="currentColor" />
          </button>
        ) : (
          <button 
            className="send-btn" 
            onClick={handleSend}
            disabled={(!content.trim() && attachments.length === 0) || isProcessingFile}
          >
            <Send size={20} />
          </button>
        )}
      </div>
      {isProcessingFile && <div className="processing-indicator">Processing attachments...</div>}
    </div>
  );
}
