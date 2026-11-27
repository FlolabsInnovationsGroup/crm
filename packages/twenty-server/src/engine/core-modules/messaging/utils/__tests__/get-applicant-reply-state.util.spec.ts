import {
  getApplicantReplyState,
  isAwaitingOurReply,
} from 'src/engine/core-modules/messaging/utils/get-applicant-reply-state.util';

const fromApplicant = (receivedAt: string) => ({
  receivedAt: new Date(receivedAt),
  isFromApplicant: true,
  isSentToApplicant: false,
});
const fromUs = (receivedAt: string) => ({
  receivedAt: new Date(receivedAt),
  isFromApplicant: false,
  isSentToApplicant: true,
});

describe('getApplicantReplyState', () => {
  const messages = [
    fromUs('2026-11-01T10:00:00Z'),
    fromApplicant('2026-11-02T10:00:00Z'),
    fromUs('2026-11-05T10:00:00Z'),
  ];

  it('finds the last email each way', () => {
    expect(getApplicantReplyState({ messages })).toEqual({
      lastApplicantMessageAt: new Date('2026-11-02T10:00:00Z'),
      lastSentToApplicantAt: new Date('2026-11-05T10:00:00Z'),
    });
  });

  it('only counts emails before the given time', () => {
    const state = getApplicantReplyState({
      messages,
      before: new Date('2026-11-05T09:50:00Z'),
    });

    expect(state.lastSentToApplicantAt).toEqual(
      new Date('2026-11-01T10:00:00Z'),
    );
    expect(isAwaitingOurReply(state)).toBe(true);
  });
});

describe('isAwaitingOurReply', () => {
  it('is true only when the applicant wrote last', () => {
    expect(
      isAwaitingOurReply({
        lastApplicantMessageAt: new Date('2026-11-02T10:00:00Z'),
        lastSentToApplicantAt: null,
      }),
    ).toBe(true);
    expect(
      isAwaitingOurReply({
        lastApplicantMessageAt: new Date('2026-11-02T10:00:00Z'),
        lastSentToApplicantAt: new Date('2026-11-03T10:00:00Z'),
      }),
    ).toBe(false);
    expect(
      isAwaitingOurReply({
        lastApplicantMessageAt: null,
        lastSentToApplicantAt: new Date('2026-11-03T10:00:00Z'),
      }),
    ).toBe(false);
  });
});
