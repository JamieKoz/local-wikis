export const MAX_RECENT_MESSAGES = 8;

export function buildRecentConversation(
  messages: Array<{ role: "user" | "assistant"; content: string }>,
) {
  return messages
    .slice(-MAX_RECENT_MESSAGES)
    .map((message) => ({
      role: message.role,
      content: message.content,
    }));
}
