import { getFoldedMessages } from '@/team-inbox/utils/getFoldedMessages';

describe('getFoldedMessages', () => {
  it('shows short lists whole', () => {
    expect(getFoldedMessages(['a', 'b', 'c'], false)).toEqual({
      hiddenCount: 0,
      visibleMessages: ['a', 'b', 'c'],
    });
  });

  it('opens long lists on their latest two messages', () => {
    expect(getFoldedMessages(['a', 'b', 'c', 'd', 'e'], false)).toEqual({
      hiddenCount: 3,
      visibleMessages: ['d', 'e'],
    });
  });

  it('shows everything once earlier messages are asked for', () => {
    expect(getFoldedMessages(['a', 'b', 'c', 'd'], true)).toEqual({
      hiddenCount: 0,
      visibleMessages: ['a', 'b', 'c', 'd'],
    });
  });
});
