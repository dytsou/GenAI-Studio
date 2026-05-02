import React, { useState, useEffect, useLayoutEffect } from 'react';
import { X, Save, AlertCircle, Eye } from 'lucide-react';
import { useSettingsStore } from '../../stores/useSettingsStore';
import { mergeMaskedSettings, type MaskedSettingsDraft } from '../../utils/settingsMasking';
import './SettingsModal.css';

function draftFromSettings(): MaskedSettingsDraft {
  const s = useSettingsStore.getState();
  return {
    apiKey: s.apiKey,
    baseUrl: s.baseUrl,
    model: s.model,
    temperature: s.temperature,
    topP: s.topP,
    maxTokens: s.maxTokens,
    contextWindowTokens: s.contextWindowTokens,
    includeStreamUsage: s.includeStreamUsage,
    systemPrompt: s.systemPrompt,
    gatewayBaseUrl: s.gatewayBaseUrl,
    useHostedGateway: s.useHostedGateway,
    useIntelligentMode: s.useIntelligentMode,
    memoryEnabled: s.memoryEnabled,
    memoryTopK: s.memoryTopK,
    toolsEnabled: s.toolsEnabled,
    intelligentIncludeSessionMemory: s.intelligentIncludeSessionMemory,
    intelligentIncludeGlobalMemory: s.intelligentIncludeGlobalMemory,
    intelligentRevealMemoryUi: s.intelligentRevealMemoryUi,
  };
}

export function SettingsModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [pressReveal, setPressReveal] = useState<'baseUrl' | 'apiKey' | null>(null);
  const settings = useSettingsStore();

  const [localSettings, setLocalSettings] = useState<MaskedSettingsDraft>(draftFromSettings);

  const isModalOpen = isOpen || !settings.apiKey;

  useEffect(() => {
    const handleOpen = () => {
      setLocalSettings(draftFromSettings());
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
    setLocalSettings((prev) => ({
      ...prev,
      [name]:
        name === 'maxTokens' || name === 'contextWindowTokens' || name === 'memoryTopK'
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

    const s = useSettingsStore.getState();
    const result = mergeMaskedSettings({
      stored: {
        apiKey: s.apiKey,
        baseUrl: s.baseUrl,
        model: s.model,
        temperature: s.temperature,
        topP: s.topP,
        maxTokens: s.maxTokens,
        contextWindowTokens: s.contextWindowTokens,
        includeStreamUsage: s.includeStreamUsage,
        systemPrompt: s.systemPrompt,
        useHostedGateway: s.useHostedGateway,
        gatewayBaseUrl: s.gatewayBaseUrl,
        useIntelligentMode: s.useIntelligentMode,
        memoryEnabled: s.memoryEnabled,
        memoryTopK: s.memoryTopK,
        toolsEnabled: s.toolsEnabled,
        intelligentIncludeSessionMemory: s.intelligentIncludeSessionMemory,
        intelligentIncludeGlobalMemory: s.intelligentIncludeGlobalMemory,
        intelligentRevealMemoryUi: s.intelligentRevealMemoryUi,
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

  const gatewayOn = localSettings.useHostedGateway;

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
          <fieldset className="settings-fieldset">
            <legend>Upstream (OpenAI-compatible)</legend>
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
          </fieldset>

          <fieldset className="settings-fieldset">
            <legend>Hosted gateway</legend>
            <div className="form-group form-checkbox-row">
              <label htmlFor="useHostedGateway" className="checkbox-label">
                <input
                  type="checkbox"
                  id="useHostedGateway"
                  checked={localSettings.useHostedGateway}
                  onChange={(e) =>
                    setLocalSettings((prev) => ({
                      ...prev,
                      useHostedGateway: e.target.checked,
                      useIntelligentMode: e.target.checked ? prev.useIntelligentMode : false,
                    }))
                  }
                />
                Use hosted gateway (Docker / Express)
              </label>
            </div>
            <div className="form-group">
              <label htmlFor="gatewayBaseUrl">Gateway base URL</label>
              <input
                type="text"
                id="gatewayBaseUrl"
                name="gatewayBaseUrl"
                value={localSettings.gatewayBaseUrl}
                onChange={handleChange}
                placeholder="http://127.0.0.1:8080"
                disabled={!gatewayOn}
              />
            </div>
            <div className={`form-group form-checkbox-row ${!gatewayOn ? 'disabled' : ''}`}>
              <label htmlFor="useIntelligentMode" className="checkbox-label">
                <input
                  type="checkbox"
                  id="useIntelligentMode"
                  checked={localSettings.useIntelligentMode}
                  disabled={!gatewayOn}
                  onChange={(e) =>
                    setLocalSettings((prev) => ({ ...prev, useIntelligentMode: e.target.checked }))
                  }
                />
                Intelligent mode (think → answer, <code>/v1/intelligent/chat</code>)
              </label>
            </div>
            <div className={`form-group form-checkbox-row ${!gatewayOn ? 'disabled' : ''}`}>
              <label htmlFor="memoryEnabled" className="checkbox-label">
                <input
                  type="checkbox"
                  id="memoryEnabled"
                  checked={localSettings.memoryEnabled}
                  disabled={!gatewayOn}
                  onChange={(e) =>
                    setLocalSettings((prev) => ({ ...prev, memoryEnabled: e.target.checked }))
                  }
                />
                Long-term memory retrieve + save
              </label>
            </div>
            <div className={`form-group ${!gatewayOn ? 'disabled' : ''}`}>
              <label htmlFor="memoryTopK">Memory chunks to retrieve (1–16)</label>
              <input
                type="number"
                id="memoryTopK"
                name="memoryTopK"
                min={1}
                max={16}
                value={localSettings.memoryTopK === '' ? '' : localSettings.memoryTopK}
                onChange={handleChange}
                disabled={!gatewayOn}
              />
            </div>
            <div className={`form-group form-checkbox-row ${!gatewayOn ? 'disabled' : ''}`}>
              <label htmlFor="toolsEnabled" className="checkbox-label">
                <input
                  type="checkbox"
                  id="toolsEnabled"
                  checked={localSettings.toolsEnabled}
                  disabled={!gatewayOn}
                  onChange={(e) =>
                    setLocalSettings((prev) => ({ ...prev, toolsEnabled: e.target.checked }))
                  }
                />
                Agent tool loop + MCP tools (when configured on gateway)
              </label>
            </div>

            <fieldset className={`settings-subfieldset ${!gatewayOn || !localSettings.useIntelligentMode ? 'disabled' : ''}`}>
              <legend>Intelligent memory (per send defaults)</legend>
              <div className="form-group form-checkbox-row">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={localSettings.intelligentIncludeSessionMemory}
                    disabled={!gatewayOn || !localSettings.useIntelligentMode}
                    onChange={(e) =>
                      setLocalSettings((prev) => ({
                        ...prev,
                        intelligentIncludeSessionMemory: e.target.checked,
                      }))
                    }
                  />
                  Include session-tier memory
                </label>
              </div>
              <div className="form-group form-checkbox-row">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={localSettings.intelligentIncludeGlobalMemory}
                    disabled={!gatewayOn || !localSettings.useIntelligentMode}
                    onChange={(e) =>
                      setLocalSettings((prev) => ({
                        ...prev,
                        intelligentIncludeGlobalMemory: e.target.checked,
                      }))
                    }
                  />
                  Include global-tier memory
                </label>
              </div>
              <div className="form-group form-checkbox-row">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={localSettings.intelligentRevealMemoryUi}
                    disabled={!gatewayOn || !localSettings.useIntelligentMode}
                    onChange={(e) =>
                      setLocalSettings((prev) => ({
                        ...prev,
                        intelligentRevealMemoryUi: e.target.checked,
                      }))
                    }
                  />
                  Reveal memory values in gateway prompt (less masking)
                </label>
              </div>
            </fieldset>
          </fieldset>

          <div className="form-group">
            <label htmlFor="model">Model Name</label>
            <input
              type="text"
              id="model"
              name="model"
              value={localSettings.model}
              onChange={handleChange}
              placeholder={settings.model || 'gpt-4o, llama-3, etc.'}
              onCopy={preventCopy}
              onCut={preventCopy}
            />
          </div>

          <div className="form-split">
            <div className="form-group">
              <label htmlFor="temperature">Temperature ({localSettings.temperature.toFixed(1)})</label>
              <input
                type="range"
                id="temperature"
                name="temperature"
                min="0"
                max="2"
                step="0.1"
                value={localSettings.temperature}
                onChange={handleChange}
              />
            </div>

            <div className="form-group">
              <label htmlFor="topP">Top P ({localSettings.topP.toFixed(1)})</label>
              <input
                type="range"
                id="topP"
                name="topP"
                min="0"
                max="1"
                step="0.1"
                value={localSettings.topP}
                onChange={handleChange}
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="maxTokens">Max Tokens (output limit)</label>
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
            <label htmlFor="contextWindowTokens">Context window (tokens, for stats)</label>
            <input
              type="number"
              id="contextWindowTokens"
              name="contextWindowTokens"
              value={localSettings.contextWindowTokens}
              onChange={handleChange}
              placeholder={String(settings.contextWindowTokens || 128000)}
              min={1}
              onCopy={preventCopy}
              onCut={preventCopy}
            />
          </div>

          <div className="form-group form-checkbox-row">
            <label htmlFor="includeStreamUsage" className="checkbox-label">
              <input
                type="checkbox"
                id="includeStreamUsage"
                name="includeStreamUsage"
                checked={localSettings.includeStreamUsage}
                onChange={(e) =>
                  setLocalSettings((prev) => ({ ...prev, includeStreamUsage: e.target.checked }))
                }
              />
              Include usage in stream (OpenAI-compatible; disable if your API rejects it)
            </label>
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
