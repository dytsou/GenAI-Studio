import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import { Sidebar } from './Sidebar';
import { initI18n } from '../../i18n/i18n';
import { useChatStore } from '../../stores/useChatStore';

describe('Sidebar i18n', () => {
  beforeEach(async () => {
    localStorage.clear();
    vi.resetModules();
    await initI18n('en');
    useChatStore.setState(useChatStore.getInitialState(), true);
  });

  it('renders translated strings for zh-TW', async () => {
    await initI18n('zh-TW');
    render(<Sidebar />);

    expect(screen.getByText('新增對話')).toBeInTheDocument();
  });
});

