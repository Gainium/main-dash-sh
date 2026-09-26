import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

/** Newest messages kept in memory. The list only feeds the live toaster; the
 *  notifications panel reads the server feed. */
export const MAX_MESSAGES = 200;

export interface MessageData {
  id: string;
  type: 'info' | 'warning' | 'error' | 'success';
  title: string;
  message: string;
  timestamp: number;
  botId?: string;
  dismissed?: boolean;
  [key: string]: unknown;
}

interface MessageStoreState {
  // Messages
  messages: MessageData[];

  // Actions
  addMessage: (message: Omit<MessageData, 'id' | 'timestamp'>) => void;
  dismissMessage: (messageId: string) => void;
  clearMessages: () => void;
  clearBotMessages: (botId: string) => void;

  // Selectors
  getMessages: () => MessageData[];
  getActiveMessages: () => MessageData[];
  getBotMessages: (botId: string) => MessageData[];
  getMessageById: (messageId: string) => MessageData | null;
  getUnreadCount: () => number;
}

export const useMessageStore = create<MessageStoreState>()(
  devtools(
    (set, get) => ({
      messages: [],

      addMessage: (messageData) => {
        const message: MessageData = {
          id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          timestamp: Date.now(),
          dismissed: false,
          type: 'info',
          title: '',
          message: '',
          ...messageData,
        };

        set((state) => ({
          messages: [message, ...state.messages].slice(0, MAX_MESSAGES),
        }));
      },

      dismissMessage: (messageId: string) => {
        set((state) => ({
          messages: state.messages.map((msg) =>
            msg.id === messageId ? { ...msg, dismissed: true } : msg
          ),
        }));
      },

      clearMessages: () => {
        set({ messages: [] });
      },

      clearBotMessages: (botId: string) => {
        set((state) => ({
          messages: state.messages.filter((msg) => msg.botId !== botId),
        }));
      },

      getMessages: () => {
        return get().messages;
      },

      getActiveMessages: () => {
        return get().messages.filter((msg) => !msg.dismissed);
      },

      getBotMessages: (botId: string) => {
        return get().messages.filter((msg) => msg.botId === botId);
      },

      getMessageById: (messageId: string) => {
        return get().messages.find((msg) => msg.id === messageId) || null;
      },

      getUnreadCount: () => {
        return get().messages.filter((msg) => !msg.dismissed).length;
      },
    }),
    {
      name: 'message-store',
    }
  )
);
