import { useState, useRef, useEffect } from 'react';
import { useChatStore } from '../../stores/useChatStore';
import type { Attachment } from '../../stores/useChatStore';
import { useSettingsStore } from '../../stores/useSettingsStore';
import { MessageRenderer } from './MessageRenderer';
import { Composer } from './Composer';
import { streamChatCompletions } from '../../api/client';
import './Chat.css';

export function Chat() {
  const { chats, activeChatId, addMessage, updateMessage, deleteMessageAndSubsequent, deleteLastMessage } = useChatStore();
  const settings = useSettingsStore();

  const activeChat = chats.find(c => c.id === activeChatId);
  const messages = activeChat?.messages || [];

  const [isGenerating, setIsGenerating] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages.length, messages[messages.length - 1]?.content]);

  const handleSend = async (content: string, attachments: Attachment[]) => {
    if (!activeChatId) return;

    addMessage(activeChatId, {
      role: 'user',
      content,
      attachments
    });

    await handleGenerate();
  };

  const handleRegenerate = async () => {
    if (!activeChatId) return;
    if (messages.length > 0 && messages[messages.length - 1].role === 'assistant') {
       deleteLastMessage(activeChatId);
    }
    await handleGenerate();
  };

  const handleEdit = async (messageId: string, newContent: string) => {
     if (!activeChatId) return;
     updateMessage(activeChatId, messageId, { content: newContent });
     deleteMessageAndSubsequent(activeChatId, messageId);
     await handleGenerate();
  };

  const handleGenerate = async () => {
    if (!activeChatId) return;

    const currentChat = useChatStore.getState().chats.find(c => c.id === activeChatId);
    if (!currentChat) return;
    const currentMessages = currentChat.messages;

    useChatStore.getState().addMessage(activeChatId, {
      role: 'assistant',
      content: '',
    });
    
    const newlyAddedChat = useChatStore.getState().chats.find(c => c.id === activeChatId);
    const lastMsg = newlyAddedChat?.messages[newlyAddedChat.messages.length - 1];
    if (!lastMsg) return;

    setIsGenerating(true);
    abortControllerRef.current = new AbortController();

    try {
      const generator = streamChatCompletions(
        currentMessages,
        undefined, 
        settings.structuredOutputMode ? undefined : undefined, // schema handled later
        abortControllerRef.current.signal
      );

      let fullContent = '';
      for await (const chunk of generator) {
        fullContent += chunk;
        updateMessage(activeChatId, lastMsg.id, { content: fullContent });
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        updateMessage(activeChatId, lastMsg.id, { error: true });
        console.error(err);
      }
    } finally {
      setIsGenerating(false);
      abortControllerRef.current = null;
    }
  };

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  if (!activeChat) {
    return (
      <div className="chat-empty-state">
        <p>Select or create a chat to begin.</p>
      </div>
    );
  }

  // Find the last user message and the last assistant message indices to enable regeneration safely
  const isMessageLastAssistantMsg = (msgId: string) => {
     if (messages.length === 0) return false;
     return messages[messages.length - 1].id === msgId && messages[messages.length - 1].role === 'assistant';
  };

  return (
    <div className="chat-container">
      <div className="chat-messages-area">
        {messages.length === 0 ? (
          <div className="chat-welcome">
            <h2>How can I help you today?</h2>
          </div>
        ) : (
          <div className="messages-list">
            {messages.map((msg) => (
              <MessageRenderer 
                key={msg.id} 
                message={msg} 
                onRegenerate={isMessageLastAssistantMsg(msg.id) && !isGenerating ? handleRegenerate : undefined}
                onEdit={msg.role === 'user' && !isGenerating ? (content) => handleEdit(msg.id, content) : undefined}
              />
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>
      <div className="chat-composer-area">
        <Composer 
          onSend={handleSend} 
          onStop={handleStop} 
          isGenerating={isGenerating} 
        />
      </div>
    </div>
  );
}
