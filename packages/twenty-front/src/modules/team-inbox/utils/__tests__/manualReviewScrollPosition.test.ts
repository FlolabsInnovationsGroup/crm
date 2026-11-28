import { getAnchoredScrollTop } from '@/team-inbox/utils/getAnchoredScrollTop';
import { getManualReviewScrollAnchor } from '@/team-inbox/utils/getManualReviewScrollAnchor';

const cards = [
  { threadId: 'first', top: -300, bottom: -100 },
  { threadId: 'second', top: -84, bottom: 116 },
  { threadId: 'third', top: 132, bottom: 332 },
];

describe('getManualReviewScrollAnchor', () => {
  it('anchors on the first card still showing at the top', () => {
    expect(getManualReviewScrollAnchor(cards, 0)).toEqual({
      threadId: 'second',
      offset: -84,
    });
  });

  it('measures from the top of the list, not of the window', () => {
    expect(getManualReviewScrollAnchor(cards, 120)).toEqual({
      threadId: 'third',
      offset: 12,
    });
  });

  it('has no anchor when no card is on screen', () => {
    expect(getManualReviewScrollAnchor([], 0)).toBeNull();
  });
});

describe('getAnchoredScrollTop', () => {
  it('keeps the card in place when a new card arrives above it', () => {
    // A 216px card added above pushed it from -84px to 132px.
    expect(
      getAnchoredScrollTop({
        anchor: { threadId: 'second', offset: -84 },
        anchorTop: 132,
        viewportTop: 0,
        scrollTop: 700,
      }),
    ).toBe(916);
  });

  it('leaves the scroll alone when the card has not moved', () => {
    expect(
      getAnchoredScrollTop({
        anchor: { threadId: 'second', offset: -84 },
        anchorTop: 36,
        viewportTop: 120,
        scrollTop: 700,
      }),
    ).toBe(700);
  });

  it('never scrolls above the top', () => {
    expect(
      getAnchoredScrollTop({
        anchor: { threadId: 'first', offset: 200 },
        anchorTop: 10,
        viewportTop: 0,
        scrollTop: 50,
      }),
    ).toBe(0);
  });
});
