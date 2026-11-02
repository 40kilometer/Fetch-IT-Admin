type OriginalRequest = { message: string; createdAt: Date; customerId: string };
type ConversationMessage = { body: string; createdAt: Date; authorRole: string; authorId: string | null };

// Some threads store the initial request as their first customer message too.
// Hide only the synthetic request card when that same event is on this page.
// Never filter saved messages: later repetitions and paginated context matter.
export function originalRequestInThread(request: OriginalRequest, messages: readonly ConversationMessage[]): boolean {
  const time = request.createdAt.getTime();
  return Number.isFinite(time) && messages.some(message =>
    message.authorRole === "CUSTOMER" && message.authorId === request.customerId &&
    message.createdAt.getTime() === time && message.body === request.message
  );
}
