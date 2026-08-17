import {
  submitMessageFeedbackAction,
  getSessionFeedbackAction,
  getMessageFeedbackAction,
} from '@/db/actions';

export type { MessageFeedback } from '@/db/repos/feedback';

export async function submitMessageFeedback(
  userId: string,
  messageId: string,
  feedbackType: 'positive' | 'negative',
  options?: {
    sessionId?: string;
    messageContent?: string;
    feedbackText?: string;
  },
) {
  return submitMessageFeedbackAction(userId, messageId, feedbackType, options);
}

export async function getSessionFeedback(userId: string, sessionId: string) {
  return getSessionFeedbackAction(userId, sessionId);
}

export async function getMessageFeedback(userId: string, messageId: string) {
  return getMessageFeedbackAction(userId, messageId);
}
