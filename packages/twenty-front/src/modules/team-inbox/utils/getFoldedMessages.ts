// The thread view's numbers: long lists open on their latest messages.
const VISIBLE_MESSAGE_COUNT = 2;
const COLLAPSE_FROM_MESSAGE_COUNT = 4;

export const getFoldedMessages = <TMessage>(
  messages: TMessage[],
  isShowingEarlier: boolean,
): { hiddenCount: number; visibleMessages: TMessage[] } => {
  const hiddenCount =
    !isShowingEarlier && messages.length >= COLLAPSE_FROM_MESSAGE_COUNT
      ? messages.length - VISIBLE_MESSAGE_COUNT
      : 0;

  return { hiddenCount, visibleMessages: messages.slice(hiddenCount) };
};
