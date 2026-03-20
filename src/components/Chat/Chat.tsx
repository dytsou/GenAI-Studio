import { useState, useRef, useEffect, useMemo } from 'react';
import { useChatStore } from '../../stores/useChatStore';
import type { Attachment } from '../../stores/useChatStore';
import { useSettingsStore } from '../../stores/useSettingsStore';
import type { SchemaField } from '../../stores/useSettingsStore';
import { MessageRenderer } from './MessageRenderer';
import { Composer } from './Composer';
import { SchemaWorkspace } from '../StructuredOutput/SchemaWorkspace';
import { streamChatCompletions } from '../../api/client';
import { ToggleRight, ToggleLeft } from 'lucide-react';
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

  const lastMessageContent = messages[messages.length - 1]?.content;

  useEffect(() => {
    scrollToBottom();
  }, [messages.length, lastMessageContent]);

  // Derive generated schema for the request
  const generatedSchema = useMemo(() => {
    if (!settings.structuredOutputMode) return undefined;
    type JsonSchemaProperty = {
      type: SchemaField['type'];
      description: string;
      items?: { type: 'string' };
    };

    const properties: Record<string, JsonSchemaProperty> = {};
    const required: string[] = [];

    settings.schemaFields.forEach(field => {
      properties[field.name] = {
        type: field.type,
        description: field.description
      };
      if (field.type === 'array') {
        properties[field.name].items = { type: 'string' };
      }
      if (field.required) {
        required.push(field.name);
      }
    });

    return {
      type: "json_schema",
      json_schema: {
        name: "user_defined_schema",
        strict: true,
        schema: {
          type: "object",
          properties,
          required,
          additionalProperties: false
        }
      }
    };
  }, [settings.structuredOutputMode, settings.schemaFields]);

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
        generatedSchema,
        abortControllerRef.current.signal
      );

      let fullContent = '';
      for await (const chunk of generator) {
        fullContent += chunk;
        updateMessage(activeChatId, lastMsg.id, { content: fullContent });
      }
    } catch (err: unknown) {
      const maybeError = err as { name?: unknown };
      if (maybeError.name !== 'AbortError') {
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

  const isMessageLastAssistantMsg = (msgId: string) => {
     if (messages.length === 0) return false;
     return messages[messages.length - 1].id === msgId && messages[messages.length - 1].role === 'assistant';
  };

  return (
    <div className={`chat-layout ${settings.structuredOutputMode ? 'with-sidebar' : ''}`}>
      <div className="chat-container">
        
        <div className="chat-header">
           <h3 className="chat-title truncate">{activeChat.title}</h3>
           <button 
             className="mode-toggle-btn" 
             onClick={() => settings.setSettings({ structuredOutputMode: !settings.structuredOutputMode })}
           >
             {settings.structuredOutputMode ? <ToggleRight size={20} className="active-toggle" /> : <ToggleLeft size={20} />}
             <span>Structured Output</span>
           </button>
        </div>

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
      
      {settings.structuredOutputMode && (
         <SchemaWorkspace onClose={() => settings.setSettings({ structuredOutputMode: false })} />
      )}
    </div>
  );
}
