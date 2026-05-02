import { v4 as uuidv4 } from 'uuid';

const WORKSPACE_LS_KEY = 'genai-studio-workspace-id';

/**
 * Stable workspace tenant id for gateway headers (not strong auth — see deploy docs).
 */
export function getOrCreateWorkspaceId(): string {
  if (typeof localStorage === 'undefined') return 'server';
  let id = localStorage.getItem(WORKSPACE_LS_KEY);
  if (!id) {
    id = uuidv4();
    localStorage.setItem(WORKSPACE_LS_KEY, id);
  }
  return id;
}
