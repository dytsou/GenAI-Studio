import { useMemo, useState } from 'react';
import { MessageSquarePlus, MessageSquare, Settings, Trash2, Menu, X } from 'lucide-react';
import { useChatStore } from '../../stores/useChatStore';
import { useTranslation } from 'react-i18next';
import './Sidebar.css';

export function Sidebar() {
  const { t } = useTranslation();
  const { chats, activeChatId, createChat, setActiveChat, deleteChat } = useChatStore();
  const [isOpen, setIsOpen] = useState(() => {
    if (typeof window === 'undefined') return true;
    return window.innerWidth >= 768;
  });
  const [searchQuery, setSearchQuery] = useState('');

  // Simple generic settings invoke event for now (needs Context/Zustand trigger later)
  const openSettings = () => {
    window.dispatchEvent(new CustomEvent('open-settings'));
  };

  const handleNewChat = () => {
    createChat();
    setSearchQuery('');
    if (window.innerWidth < 768) setIsOpen(false);
  };

  const handleSelectChat = (id: string) => {
    setActiveChat(id);
    if (window.innerWidth < 768) setIsOpen(false);
  }

  const trimmedQuery = searchQuery.trim().toLowerCase();
  const visibleChats = useMemo(() => {
    if (!trimmedQuery) return chats;
    return chats.filter((c) => c.title.toLowerCase().includes(trimmedQuery));
  }, [chats, trimmedQuery]);

  return (
    <>
      <button 
        className={`sidebar-toggle ${isOpen ? 'open' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        aria-label={t('sidebar.toggle')}
      >
        {isOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      {isOpen && <div className="sidebar-overlay" onClick={() => setIsOpen(false)} />}

      <aside className={`sidebar ${isOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <button className="new-chat-btn" onClick={handleNewChat}>
            <MessageSquarePlus size={20} />
            <span>{t('sidebar.newChat')}</span>
          </button>
        </div>

        <div className="sidebar-content">
          <input
            className="chat-search"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('sidebar.searchPlaceholder')}
            aria-label={t('sidebar.searchAriaLabel')}
          />

          {chats.length === 0 ? (
            <div className="empty-chats">{t('sidebar.emptyNoChats')}</div>
          ) : (
            <>
              {visibleChats.length === 0 ? (
                <div className="empty-chats">{t('sidebar.emptyNoMatches')}</div>
              ) : (
                <ul className="chat-list">
                  {visibleChats.map(chat => (
                <li key={chat.id} className={activeChatId === chat.id ? 'active' : ''}>
                  <button 
                    className="chat-item-btn"
                    onClick={() => handleSelectChat(chat.id)}
                    aria-label={t('sidebar.selectChat')}
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
                    aria-label={t('sidebar.deleteChat')}
                  >
                    <Trash2 size={16} />
                  </button>
                </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>

        <div className="sidebar-footer">
          <button className="settings-btn" onClick={openSettings}>
            <Settings size={20} />
            <span>{t('sidebar.settings')}</span>
          </button>
        </div>
      </aside>
    </>
  );
}
