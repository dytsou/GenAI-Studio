import type { Attachment } from '../../stores/useChatStore';

export type QueuedSend = {
  id: string;
  content: string;
  attachments: Attachment[];
  promptOverride?: string;
};
