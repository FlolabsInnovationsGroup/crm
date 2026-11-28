import { readTeamInboxPreference } from '@/team-inbox/utils/readTeamInboxPreference';
import { writeTeamInboxPreference } from '@/team-inbox/utils/writeTeamInboxPreference';

const KEY = 'teamInbox.test.sort';
const VALUES = ['NEWEST_FIRST', 'OLDEST_FIRST'];

describe('team inbox preferences', () => {
  afterEach(() => {
    window.localStorage.clear();
    jest.restoreAllMocks();
  });

  it('reads back a saved choice', () => {
    writeTeamInboxPreference(KEY, 'OLDEST_FIRST');

    expect(readTeamInboxPreference(KEY, VALUES, 'NEWEST_FIRST')).toBe(
      'OLDEST_FIRST',
    );
  });

  it('falls back when nothing or an unknown value is saved', () => {
    expect(readTeamInboxPreference(KEY, VALUES, 'NEWEST_FIRST')).toBe(
      'NEWEST_FIRST',
    );

    window.localStorage.setItem(KEY, 'SIDEWAYS');

    expect(readTeamInboxPreference(KEY, VALUES, 'NEWEST_FIRST')).toBe(
      'NEWEST_FIRST',
    );
  });

  it('keeps working when the browser blocks storage', () => {
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });

    expect(() => writeTeamInboxPreference(KEY, 'OLDEST_FIRST')).not.toThrow();
    expect(readTeamInboxPreference(KEY, VALUES, 'NEWEST_FIRST')).toBe(
      'NEWEST_FIRST',
    );
  });
});
