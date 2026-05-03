import { useEffect } from 'react';
import { Layout } from './components/Layout/Layout';
import { useChatStore } from './stores/useChatStore';
import { SettingsModal } from './components/SettingsModal/SettingsModal';
import { Chat } from './components/Chat/Chat';
import { initI18n } from './i18n/i18n';
import { useSettingsStore } from './stores/useSettingsStore';
import './App.css';

function App() {
  const { chats, createChat } = useChatStore();
  const language = useSettingsStore((s) => s.language);

  useEffect(() => {
    if (chats.length === 0) {
      createChat();
    }
  }, [chats.length, createChat]);

  useEffect(() => {
    void initI18n(language);
    document.documentElement.lang = language;
  }, [language]);

  return (
    <>
      <Layout>
        <Chat />
      </Layout>
      <SettingsModal />
    </>
  );
}

export default App;
