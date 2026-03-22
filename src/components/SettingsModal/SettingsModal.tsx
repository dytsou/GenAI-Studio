import React, { useState, useEffect, useLayoutEffect } from 'react';
import { X, Save, AlertCircle, Eye } from 'lucide-react';
import { useSettingsStore } from '../../stores/useSettingsStore';
import { mergeMaskedSettings, type MaskedSettingsDraft } from '../../utils/settingsMasking';
import './SettingsModal.css';

export function SettingsModal() {
  const [isOpen, setIsOpen] = useState(false);
  /** Which secret field is temporarily visible while its reveal button is held (pointer down). */
  const [pressReveal, setPressReveal] = useState<'baseUrl' | 'apiKey' | null>(null);
  const settings = useSettingsStore();

  // Mask stored config values in the UI by not pre-filling text inputs.
  const [localSettings, setLocalSettings] = useState<MaskedSettingsDraft>({
    apiKey: settings.apiKey,
    baseUrl: settings.baseUrl,
    model: settings.model,
    temperature: settings.temperature,
    topP: settings.topP,
    maxTokens: settings.maxTokens,
    systemPrompt: settings.systemPrompt,
  });

  const isModalOpen = isOpen || !settings.apiKey;

  useEffect(() => {
    const handleOpen = () => {
      setLocalSettings({
        apiKey: settings.apiKey,
        baseUrl: settings.baseUrl,
        model: settings.model,
        temperature: settings.temperature,
        topP: settings.topP,
        maxTokens: settings.maxTokens,
        systemPrompt: settings.systemPrompt,
      });
      setPressReveal(null);
      setIsOpen(true);
    };
    window.addEventListener('open-settings', handleOpen);

    return () => window.removeEventListener('open-settings', handleOpen);
  }, [settings]);

  useLayoutEffect(() => {
    if (pressReveal === null) return;
    const end = () => setPressReveal(null);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'Enter') end();
    };
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [pressReveal]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    setLocalSettings(prev => ({
      ...prev,
      [name]:
        name === 'maxTokens'
          ? value === ''
            ? ''
            : Number(value)
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
        systemPrompt: settings.systemPrompt,
      },
      draft: localSettings,
    });

    if ('error' in result) {
      alert(result.error);
      return;
    }

    settings.setSettings(result.merged);
    setPressReveal(null);
    setIsOpen(false);
  };

  if (!isModalOpen) return null;

  const preventCopy = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
  };

  const preventCopyUnlessRevealed =
    (field: 'baseUrl' | 'apiKey') => (e: React.ClipboardEvent<HTMLInputElement>) => {
      if (pressReveal !== field) e.preventDefault();
    };

  return (
    <div className="modal-overlay">
      <div className="modal-content settings-modal">
        <div className="modal-header">
          <h2>Application Settings</h2>
          {settings.apiKey && (
            <button
              className="close-btn"
              onClick={() => {
                setPressReveal(null);
                setIsOpen(false);
              }}
              aria-label="Close Settings"
            >
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
            <div className="secret-input-row">
              <input
                type={pressReveal === 'baseUrl' ? 'text' : 'password'}
                id="baseUrl"
                name="baseUrl"
                value={localSettings.baseUrl}
                onChange={handleChange}
                placeholder={settings.baseUrl || 'https://api.openai.com/v1'}
                autoComplete="off"
                onCopy={preventCopyUnlessRevealed('baseUrl')}
                onCut={preventCopyUnlessRevealed('baseUrl')}
              />
              <button
                type="button"
                className="secret-reveal-btn"
                aria-label="Hold to reveal API base URL"
                title="Hold to show"
                onPointerDown={(e) => {
                  e.preventDefault();
                  setPressReveal('baseUrl');
                }}
                onKeyDown={(e) => {
                  if (e.key === ' ' || e.key === 'Enter') {
                    e.preventDefault();
                    setPressReveal('baseUrl');
                  }
                }}
              >
                <Eye size={18} aria-hidden />
              </button>
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="apiKey">API Key (Stored locally)</label>
            <div className="secret-input-row">
              <input
                type={pressReveal === 'apiKey' ? 'text' : 'password'}
                id="apiKey"
                name="apiKey"
                value={localSettings.apiKey}
                onChange={handleChange}
                placeholder={settings.apiKey ? 'Leave empty to keep existing key' : 'sk-...'}
                autoComplete="off"
                onCopy={preventCopyUnlessRevealed('apiKey')}
                onCut={preventCopyUnlessRevealed('apiKey')}
              />
              <button
                type="button"
                className="secret-reveal-btn"
                aria-label="Hold to reveal API key"
                title="Hold to show"
                onPointerDown={(e) => {
                  e.preventDefault();
                  setPressReveal('apiKey');
                }}
                onKeyDown={(e) => {
                  if (e.key === ' ' || e.key === 'Enter') {
                    e.preventDefault();
                    setPressReveal('apiKey');
                  }
                }}
              >
                <Eye size={18} aria-hidden />
              </button>
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="model">Model Name</label>
            <input 
              type="text"
              id="model" 
              name="model" 
              value={localSettings.model}
              onChange={handleChange}
              placeholder={settings.model || "gpt-4o, llama-3, etc."}
              onCopy={preventCopy}
              onCut={preventCopy}
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
              value={localSettings.maxTokens}
              onChange={handleChange}
              placeholder={String(settings.maxTokens || 4096)}
              onCopy={preventCopy}
              onCut={preventCopy}
            />
          </div>

          <div className="form-group">
            <label htmlFor="systemPrompt">System Prompt</label>
            <textarea
              id="systemPrompt"
              name="systemPrompt"
              value={localSettings.systemPrompt}
              onChange={handleChange}
              placeholder="Optional instructions for assistant behavior..."
              rows={4}
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
