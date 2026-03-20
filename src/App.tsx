import { useEffect } from 'react';
import { Layout } from './components/Layout/Layout';
import { useChatStore } from './stores/useChatStore';
import { SettingsModal } from './components/SettingsModal/SettingsModal';
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
        <div className="main-placeholder">
          <h1>GenAI Studio</h1>
          <p>Your conversation starts here</p>
        </div>
      </Layout>
      <SettingsModal />
    </>
  );
}

export default App;
