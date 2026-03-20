import { useState } from 'react';
import { MessageSquarePlus, MessageSquare, Settings, Trash2, Menu, X } from 'lucide-react';
import { useChatStore } from '../../stores/useChatStore';
import './Sidebar.css';

export function Sidebar() {
  const { chats, activeChatId, createChat, setActiveChat, deleteChat } = useChatStore();
  const [isOpen, setIsOpen] = useState(false);

  // Simple generic settings invoke event for now (needs Context/Zustand trigger later)
  const openSettings = () => {
    window.dispatchEvent(new CustomEvent('open-settings'));
  };

  const handleNewChat = () => {
    createChat();
    if (window.innerWidth < 768) setIsOpen(false);
  };

  const handleSelectChat = (id: string) => {
    setActiveChat(id);
    if (window.innerWidth < 768) setIsOpen(false);
  }

  return (
    <>
      <button 
        className={`sidebar-toggle ${isOpen ? 'open' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Toggle Sidebar"
      >
        {isOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      {isOpen && <div className="sidebar-overlay" onClick={() => setIsOpen(false)} />}

      <aside className={`sidebar ${isOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <button className="new-chat-btn" onClick={handleNewChat}>
            <MessageSquarePlus size={20} />
            <span>New chat</span>
          </button>
        </div>

        <div className="sidebar-content">
          {chats.length === 0 ? (
            <div className="empty-chats">No chats yet</div>
          ) : (
            <ul className="chat-list">
              {chats.map(chat => (
                <li key={chat.id} className={activeChatId === chat.id ? 'active' : ''}>
                  <button 
                    className="chat-item-btn"
                    onClick={() => handleSelectChat(chat.id)}
                  >
                    <MessageSquare size={16} className="chat-icon" />
                    <span className="chat-title" title={chat.title}>{chat.title}</span>
                  </button>
                  <button 
                    className="delete-btn" 
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteChat(chat.id);
                    }}
                    aria-label="Delete chat"
                  >
                    <Trash2 size={16} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="sidebar-footer">
          <button className="settings-btn" onClick={openSettings}>
            <Settings size={20} />
            <span>Settings</span>
          </button>
        </div>
      </aside>
    </>
  );
}
