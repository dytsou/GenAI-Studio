import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { SettingsModal } from './SettingsModal';
import { useSettingsStore } from '../../stores/useSettingsStore';
import { initI18n } from '../../i18n/i18n';

describe('SettingsModal language setting', () => {
  beforeEach(async () => {
    localStorage.clear();
    vi.restoreAllMocks();
    await initI18n('en');
    useSettingsStore.setState(useSettingsStore.getInitialState(), true);
  });

  it('persists language on save', async () => {
    const user = userEvent.setup();
    useSettingsStore.setState({ apiKey: 'stored-key' });

    render(<SettingsModal />);
    window.dispatchEvent(new CustomEvent('open-settings'));

    const select = await screen.findByLabelText('App language');
    await user.selectOptions(select, 'zh-TW');

    await user.click(screen.getByRole('button', { name: /save configuration/i }));

    expect(useSettingsStore.getState().language).toBe('zh-TW');
  });
});

