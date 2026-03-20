import React, { useEffect } from 'react';
import { Layout } from './components/Layout/Layout';
import { useChatStore } from './stores/useChatStore';
import './App.css';

function App() {
  const { chats, createChat } = useChatStore();

  useEffect(() => {
    // Create an initial chat if none exists
    if (chats.length === 0) {
      createChat();
    }
  }, [chats.length, createChat]);

  return (
    <Layout>
      <div className="main-placeholder">
        {/* We will build Composer and MessageRenderer here */}
        <h1>GenAI Studio</h1>
        <p>Your conversation starts here</p>
      </div>
    </Layout>
  );
}

export default App;
