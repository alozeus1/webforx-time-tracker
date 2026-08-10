import { createContext, useContext } from 'react';

export type ToastTone = 'success' | 'error' | 'info';

export type ToastOptions = {
  tone?: ToastTone;
  durationMs?: number;
};

export type ConfirmOptions = {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
};

export type FeedbackContextValue = {
  toast: (message: string, options?: ToastOptions) => void;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
};

const defaultFeedback: FeedbackContextValue = {
  toast: (message, options) => {
    if (options?.tone === 'error') console.error(`[Feedback] ${message}`);
  },
  confirm: async () => false,
};

export const FeedbackContext = createContext<FeedbackContextValue>(defaultFeedback);

export const useFeedback = (): FeedbackContextValue => {
  return useContext(FeedbackContext);
};
