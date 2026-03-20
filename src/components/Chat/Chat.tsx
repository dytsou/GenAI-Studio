import { useState, useRef, useEffect } from 'react';
import { useChatStore, Message, Attachment } from '../../stores/useChatStore';
import { useSettingsStore } from '../../stores/useSettingsStore';
import { MessageRenderer } from './MessageRenderer';
import { Composer } from './Composer';
import { streamChatCompletions } from '../../api/client';
import { v4 as uuidv4 } from 'uuid';
import './Chat.css';

export function Chat() {
  const { chats, activeChatId, addMessage, updateMessage } = useChatStore();
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

    // Add User Message
    addMessage(activeChatId, {
      role: 'user',
      content,
      attachments
    });

    await handleGenerate();
  };

  const handleGenerate = async () => {
    if (!activeChatId) return;

    // We need to fetch the newly updated messages state somehow or rely on the previous
    // Since we just dispatched addMessage, it might not be reflected in `messages` sync array yet
    // Best way is to read directly from the store state
    const currentChat = useChatStore.getState().chats.find(c => c.id === activeChatId);
    if (!currentChat) return;
    const currentMessages = currentChat.messages;

    const assistantMsgId = uuidv4();
    useChatStore.getState().addMessage(activeChatId, {
      role: 'assistant',
      content: '',
      // Note: addMessage auto-generates a new ID, so we need to capture what ID was generated
    });
    
    // Actually, addMessage generates an ID internally but doesn't return it!
    // We should fix that or construct it outside. I will rely on reading the last message ID
    const newlyAddedChat = useChatStore.getState().chats.find(c => c.id === activeChatId);
    const lastMsg = newlyAddedChat?.messages[newlyAddedChat.messages.length - 1];
    if (!lastMsg) return;

    setIsGenerating(true);
    abortControllerRef.current = new AbortController();

    try {
      const generator = streamChatCompletions(
        currentMessages,
        undefined, // System prompt later if needed
        settings.structuredOutputMode ? undefined : undefined, // Replace later for Schema
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

  return (
    <div className="chat-container">
      <div className="chat-messages-area">
        {messages.length === 0 ? (
          <div className="chat-welcome">
            <h2>How can I help you today?</h2>
          </div>
        ) : (
          <div className="messages-list">
            {messages.map(msg => (
              <MessageRenderer key={msg.id} message={msg} />
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
