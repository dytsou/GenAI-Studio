import { useEffect } from 'react';
import { Layout } from './components/Layout/Layout';
import { useChatStore } from './stores/useChatStore';
import { SettingsModal } from './components/SettingsModal/SettingsModal';
import { Chat } from './components/Chat/Chat';
import './App.css';

function App() {
  const { chats, createChat } = useChatStore();

  useEffect(() => {
    if (chats.length === 0) {
      createChat();
    }
  }, [chats.length, createChat]);

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
