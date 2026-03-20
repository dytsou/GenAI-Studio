import React, { useState, useEffect } from 'react';
import { X, Save, AlertCircle } from 'lucide-react';
import { useSettingsStore } from '../../stores/useSettingsStore';
import { mergeMaskedSettings, type MaskedSettingsDraft } from '../../utils/settingsMasking';
import './SettingsModal.css';

export function SettingsModal() {
  const [isOpen, setIsOpen] = useState(false);
  const settings = useSettingsStore();

  // Mask stored config values in the UI by not pre-filling text inputs.
  const [localSettings, setLocalSettings] = useState<MaskedSettingsDraft>({
    apiKey: '',
    baseUrl: '',
    model: '',
    temperature: settings.temperature,
    topP: settings.topP,
    maxTokens: '',
  });

  const isModalOpen = isOpen || !settings.apiKey;

  useEffect(() => {
    const handleOpen = () => {
      setLocalSettings({
        apiKey: '',
        baseUrl: '',
        model: '',
        temperature: settings.temperature,
        topP: settings.topP,
        maxTokens: '',
      });
      setIsOpen(true);
    };
    window.addEventListener('open-settings', handleOpen);

    return () => window.removeEventListener('open-settings', handleOpen);
  }, [settings]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type } = e.target;
    setLocalSettings(prev => ({
      ...prev,
      [name]:
        name === 'maxTokens' && value === ''
          ? ''
          : type === 'number' || type === 'range'
            ? Number(value)
            : value,
    }));
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();

    const result = mergeMaskedSettings({
      stored: {
        apiKey: settings.apiKey,
        baseUrl: settings.baseUrl,
        model: settings.model,
        temperature: settings.temperature,
        topP: settings.topP,
        maxTokens: settings.maxTokens,
      },
      draft: localSettings,
    });

    if ('error' in result) {
      alert(result.error);
      return;
    }

    settings.setSettings(result.merged);
    setIsOpen(false);
  };

  if (!isModalOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content settings-modal">
        <div className="modal-header">
          <h2>Application Settings</h2>
          {settings.apiKey && (
            <button className="close-btn" onClick={() => setIsOpen(false)} aria-label="Close Settings">
              <X size={20} />
            </button>
          )}
        </div>
        
        {!settings.apiKey && (
          <div className="api-warning">
            <AlertCircle size={20} />
            <span>Please configure your API Key to start using the app.</span>
          </div>
        )}

        <form onSubmit={handleSave} className="settings-form">
          <div className="form-group">
            <label htmlFor="baseUrl">API Base URL</label>
            <input 
              type="url" 
              id="baseUrl" 
              name="baseUrl" 
              value={localSettings.baseUrl}
              onChange={handleChange}
              placeholder="https://api.openai.com/v1"
            />
          </div>

          <div className="form-group">
            <label htmlFor="apiKey">API Key (Stored locally)</label>
            <input 
              type="password" 
              id="apiKey" 
              name="apiKey" 
              value={localSettings.apiKey}
              onChange={handleChange}
              placeholder="sk-..."
            />
          </div>

          <div className="form-group">
            <label htmlFor="model">Model Name</label>
            <input 
              type="text" 
              id="model" 
              name="model" 
              value={localSettings.model}
              onChange={handleChange}
              placeholder="gpt-4o, llama-3, etc."
            />
          </div>

          <div className="form-split">
            <div className="form-group">
              <label htmlFor="temperature">
                Temperature ({localSettings.temperature.toFixed(1)})
              </label>
              <input 
                type="range" 
                id="temperature" 
                name="temperature" 
                min="0" max="2" step="0.1" 
                value={localSettings.temperature} 
                onChange={handleChange}
              />
            </div>

            <div className="form-group">
              <label htmlFor="topP">
                Top P ({localSettings.topP.toFixed(1)})
              </label>
              <input 
                type="range" 
                id="topP" 
                name="topP" 
                min="0" max="1" step="0.1" 
                value={localSettings.topP} 
                onChange={handleChange}
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="maxTokens">Max Tokens</label>
            <input 
              type="number" 
              id="maxTokens" 
              name="maxTokens" 
              min="1" max="32768" 
              value={localSettings.maxTokens}
              onChange={handleChange}
              placeholder="4096"
            />
          </div>

          <div className="modal-footer">
            <button type="submit" className="save-btn">
              <Save size={18} />
              Save Configuration
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
