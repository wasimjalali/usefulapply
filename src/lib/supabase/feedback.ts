import { submitMessageFeedbackAction } from '@/db/actions';

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
