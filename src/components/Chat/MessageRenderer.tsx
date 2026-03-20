import React, { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import DOMPurify from 'dompurify';
import { Message } from '../../stores/useChatStore';
import { Bot, User } from 'lucide-react';
import './MessageRenderer.css';

interface MessageRendererProps {
  message: Message;
}

export const MessageRenderer = memo(function MessageRenderer({ message }: MessageRendererProps) {
  const isUser = message.role === 'user';
  
  // Clean content to prevent XSS as required
  const cleanContent = DOMPurify.sanitize(message.content);

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
        <div className="markdown-prose">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {cleanContent}
          </ReactMarkdown>
        </div>
        {message.error && (
          <div className="message-error">
            An error occurred while generating this response.
          </div>
        )}
      </div>
    </div>
  );
});
