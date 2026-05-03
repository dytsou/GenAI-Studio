import React, { useState, useEffect, useLayoutEffect } from 'react';
import { X, Save, AlertCircle, Eye } from 'lucide-react';
import { useSettingsStore } from '../../stores/useSettingsStore';
import { mergeMaskedSettings, type MaskedSettingsDraft } from '../../utils/settingsMasking';
import { useTranslation } from 'react-i18next';
import './SettingsModal.css';

function draftFromSettings(): MaskedSettingsDraft {
  const s = useSettingsStore.getState();
  return {
    language: s.language,
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
  const { t } = useTranslation();
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
        language: s.language,
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
          <h2>{t('settings.title')}</h2>
          {settings.apiKey && (
            <button
              className="close-btn"
              onClick={() => {
                setPressReveal(null);
                setIsOpen(false);
              }}
              aria-label={t('settings.close')}
            >
              <X size={20} />
            </button>
          )}
        </div>

        {!settings.apiKey && (
          <div className="api-warning">
            <AlertCircle size={20} />
            <span>{t('settings.apiWarning')}</span>
          </div>
        )}

        <form onSubmit={handleSave} className="settings-form">
          <fieldset className="settings-fieldset">
            <legend>{t('settings.languageLegend')}</legend>
            <div className="form-group">
              <label htmlFor="language">{t('settings.languageLabel')}</label>
              <select
                id="language"
                name="language"
                value={localSettings.language}
                onChange={(e) =>
                  setLocalSettings((prev) => ({
                    ...prev,
                    language: e.target.value === 'zh-TW' ? 'zh-TW' : 'en',
                  }))
                }
              >
                <option value="en">English</option>
                <option value="zh-TW">繁體中文</option>
              </select>
            </div>
          </fieldset>

          <fieldset className="settings-fieldset">
            <legend>{t('settings.upstreamLegend')}</legend>
            <div className="form-group">
              <label htmlFor="baseUrl">{t('settings.apiBaseUrl')}</label>
              <div className="secret-input-row">
                <input
                  type={pressReveal === 'baseUrl' ? 'text' : 'password'}
                  id="baseUrl"
                  name="baseUrl"
                  value={localSettings.baseUrl}
                  onChange={handleChange}
                  placeholder={settings.baseUrl || t('settings.defaultBaseUrl')}
                  autoComplete="off"
                  onCopy={preventCopyUnlessRevealed('baseUrl')}
                  onCut={preventCopyUnlessRevealed('baseUrl')}
                />
                <button
                  type="button"
                  className="secret-reveal-btn"
                  aria-label={t('settings.holdToRevealBaseUrl')}
                  title={t('settings.holdToShow')}
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
              <label htmlFor="apiKey">{t('settings.apiKey')}</label>
              <div className="secret-input-row">
                <input
                  type={pressReveal === 'apiKey' ? 'text' : 'password'}
                  id="apiKey"
                  name="apiKey"
                  value={localSettings.apiKey}
                  onChange={handleChange}
                  placeholder={
                    settings.apiKey ? t('settings.keepExistingApiKey') : t('settings.apiKeyPlaceholder')
                  }
                  autoComplete="off"
                  onCopy={preventCopyUnlessRevealed('apiKey')}
                  onCut={preventCopyUnlessRevealed('apiKey')}
                />
                <button
                  type="button"
                  className="secret-reveal-btn"
                  aria-label={t('settings.holdToRevealApiKey')}
                  title={t('settings.holdToShow')}
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
            <legend>{t('settings.gatewayLegend')}</legend>
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
                {t('settings.useHostedGateway')}
              </label>
            </div>
            <div className="form-group">
              <label htmlFor="gatewayBaseUrl">{t('settings.gatewayBaseUrl')}</label>
              <input
                type="text"
                id="gatewayBaseUrl"
                name="gatewayBaseUrl"
                value={localSettings.gatewayBaseUrl}
                onChange={handleChange}
                placeholder={t('settings.defaultGatewayUrl')}
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
                {t('settings.intelligentMode', { path: '/v1/intelligent/chat' })}
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
                {t('settings.memoryEnabled')}
              </label>
            </div>
            <div className={`form-group ${!gatewayOn ? 'disabled' : ''}`}>
              <label htmlFor="memoryTopK">{t('settings.memoryTopK')}</label>
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
                {t('settings.toolsEnabled')}
              </label>
            </div>

            <fieldset className={`settings-subfieldset ${!gatewayOn || !localSettings.useIntelligentMode ? 'disabled' : ''}`}>
              <legend>{t('settings.intelligentMemoryLegend')}</legend>
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
                  {t('settings.includeSessionMemory')}
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
                  {t('settings.includeGlobalMemory')}
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
                  {t('settings.revealValues')}
                </label>
              </div>
            </fieldset>
          </fieldset>

          <div className="form-group">
            <label htmlFor="model">{t('settings.modelName')}</label>
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
              <label htmlFor="temperature">{t('settings.temperature')} ({localSettings.temperature.toFixed(1)})</label>
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
              <label htmlFor="topP">{t('settings.topP')} ({localSettings.topP.toFixed(1)})</label>
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
            <label htmlFor="maxTokens">{t('settings.maxTokens')}</label>
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
            <label htmlFor="contextWindowTokens">{t('settings.contextWindow')}</label>
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
              {t('settings.includeUsage')}
            </label>
          </div>

          <div className="form-group">
            <label htmlFor="systemPrompt">{t('settings.systemPrompt')}</label>
            <textarea
              id="systemPrompt"
              name="systemPrompt"
              value={localSettings.systemPrompt}
              onChange={handleChange}
              placeholder={t('settings.systemPromptPlaceholder')}
              rows={4}
            />
          </div>

          <div className="modal-footer">
            <button type="submit" className="save-btn">
              <Save size={18} />
              {t('settings.save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
