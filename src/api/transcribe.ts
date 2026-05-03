import { useSettingsStore } from '../stores/useSettingsStore';
import { getOrCreateWorkspaceId } from './gatewayWorkspaceId';

/**
 * Sends audio WebM blob to gateway `POST /v1/transcribe`. Requires hosted gateway mode.
 */
export async function transcribeAudio(blob: Blob): Promise<string> {
  const s = useSettingsStore.getState();
  if (!s.useHostedGateway) {
    throw new Error('Hosted gateway must be enabled in Settings.');
  }
  const gw = (s.gatewayBaseUrl || 'http://127.0.0.1:8080').replace(/\/$/, '');
  const base = (s.baseUrl.endsWith('/') ? s.baseUrl.slice(0, -1) : s.baseUrl) || s.baseUrl;
  const fd = new FormData();
  fd.append('audio', blob, 'recording.webm');
  const res = await fetch(`${gw}/v1/transcribe`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${s.apiKey}`,
      'X-Upstream-Base-Url': base,
      'X-Workspace-Id': getOrCreateWorkspaceId(),
    },
    body: fd,
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || `Transcribe HTTP ${res.status}`);
  }
  const json = (await res.json()) as { text?: string };
  if (typeof json.text !== 'string') {
    throw new Error('Invalid transcribe response');
  }
  return json.text.trim();
}
