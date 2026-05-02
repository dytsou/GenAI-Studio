import { memo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import DOMPurify from 'dompurify';
import type { Message } from '../../stores/useChatStore';
import { Bot, User, RefreshCw, Check, X, Edit2 } from 'lucide-react';
import './MessageRenderer.css';

interface MessageRendererProps {
  message: Message;
  onRegenerate?: () => void;
  onEdit?: (content: string) => void;
}

export const MessageRenderer = memo(function MessageRenderer({ message, onRegenerate, onEdit }: MessageRendererProps) {
  const isUser = message.role === 'user';
  const cleanContent = DOMPurify.sanitize(message.content);
  const mem = message.memoryInjection;
  
  const [isEditing, setIsEditing] = useState(false);
  const [draftContent, setDraftContent] = useState(message.content);

  const handleSaveEdit = () => {
    if (draftContent.trim() && draftContent !== message.content) {
      onEdit?.(draftContent);
    }
    setIsEditing(false);
  };

  return (
    <div className={`message-row ${isUser ? 'user' : 'assistant'}`}>
      <div className="message-avatar">
        {isUser ? <User size={20} /> : <Bot size={20} />}
      </div>
      <div className="message-content">
        {message.attachments && message.attachments.length > 0 && (
          <div className="message-attachments">
            {message.attachments.map((att, idx) => (
              <div key={idx} className="attachment-preview">
                <img src={att.dataUrl} alt={att.name} loading="lazy" />
              </div>
            ))}
          </div>
        )}
        
        {isEditing ? (
           <div className="message-editor">
             <textarea 
               value={draftContent}
               onChange={(e) => setDraftContent(e.target.value)}
               className="edit-textarea"
               rows={Math.max(3, draftContent.split('\n').length)}
             />
             <div className="edit-actions">
               <button onClick={() => setIsEditing(false)} className="cancel-edit-btn"><X size={16}/> Cancel</button>
               <button onClick={handleSaveEdit} className="save-edit-btn"><Check size={16}/> Save & Resend</button>
             </div>
           </div>
        ) : (
          <div className="markdown-prose">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {cleanContent}
            </ReactMarkdown>
          </div>
        )}
        
        {message.error && (
          <div className="message-error">
            An error occurred while generating this response.
          </div>
        )}

        {!isUser && mem ? (
          <details className="message-memory-used">
            <summary>
              Memory used: <strong>{mem.mode}</strong> ·{' '}
              <strong>{mem.chunkIdsInjected.length}</strong> chunks
              {mem.memoryTokensEstimate != null ? ` · ~${Math.round(mem.memoryTokensEstimate)} tok` : ''}
            </summary>
            <div className="message-memory-used-body">
              {Array.isArray(mem.chunksInjected) && mem.chunksInjected.length ? (
                <div className="message-memory-used-chips">
                  {mem.chunksInjected.flatMap((c) =>
                    (c.keyphrases ?? []).length
                      ? (c.keyphrases ?? []).slice(0, 12).map((k) => (
                          <span key={`${c.chunk_id}:${k}`} className="message-memory-chip">
                            {k}
                          </span>
                        ))
                      : [
                          <span
                            key={`${c.chunk_id}:none`}
                            className="message-memory-chip empty"
                          >
                            No keywords
                          </span>,
                        ],
                  )}
                </div>
              ) : (
                <div className="message-memory-used-ids">
                  {mem.chunkIdsInjected.length ? mem.chunkIdsInjected.join(', ') : '(none)'}
                </div>
              )}
            </div>
          </details>
        ) : null}

        <div className="message-actions">
           {!isUser && onRegenerate && (
              <button className="action-btn" onClick={onRegenerate} title="Regenerate response">
                <RefreshCw size={14} />
              </button>
           )}
           {isUser && onEdit && !isEditing && (
              <button className="action-btn" onClick={() => setIsEditing(true)} title="Edit message">
                <Edit2 size={14} />
              </button>
           )}
        </div>
      </div>
    </div>
  );
});
