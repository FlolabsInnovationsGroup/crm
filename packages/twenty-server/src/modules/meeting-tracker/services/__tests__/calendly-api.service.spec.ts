import { CalendlyApiService } from 'src/modules/meeting-tracker/services/calendly-api.service';

const INVITEE_URI =
  'https://api.calendly.com/scheduled_events/EVENT/invitees/INVITEE';
const EVENT_URI = 'https://api.calendly.com/scheduled_events/EVENT';

const json = (status: number, body: unknown = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

describe('CalendlyApiService', () => {
  const fetchMock = jest.fn();
  const service = new CalendlyApiService();

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock;
    process.env.FLOLABS_PAYMENTS_WORKSPACE_ID = 'workspace-id';
    process.env.FLOLABS_CALENDLY_TOKENS = 'first-token,second-token';
  });

  afterEach(() => {
    delete process.env.FLOLABS_CALENDLY_TOKENS;
  });

  const authorizationOf = (callIndex: number) =>
    (
      fetchMock.mock.calls[callIndex][1] as RequestInit & {
        headers: Record<string, string>;
      }
    ).headers.authorization;

  it('tries the next account when one cannot see the booking', async () => {
    fetchMock
      .mockResolvedValueOnce(json(404))
      .mockResolvedValueOnce(
        json(200, {
          resource: {
            uri: INVITEE_URI,
            email: 'ada@example.com',
            status: 'active',
            event: EVENT_URI,
          },
        }),
      )
      .mockResolvedValueOnce(
        json(200, {
          resource: {
            uri: EVENT_URI,
            status: 'active',
            start_time: '2026-11-30T15:00:00Z',
          },
        }),
      );

    const booking = await service.getBooking(INVITEE_URI);

    expect(booking?.inviteeEmail).toBe('ada@example.com');
    expect(authorizationOf(0)).toBe('Bearer first-token');
    expect(authorizationOf(1)).toBe('Bearer second-token');
    expect(authorizationOf(2)).toBe('Bearer second-token');
  });

  it('fails instead of dropping the booking when a token is refused', async () => {
    fetchMock.mockResolvedValueOnce(json(401)).mockResolvedValueOnce(json(404));

    await expect(service.getBooking(INVITEE_URI)).rejects.toThrow(
      'a token may have expired',
    );
  });

  it('never sends a token outside the Calendly API', async () => {
    expect(
      await service.getBooking(
        'https://attacker.example/scheduled_events/A/invitees/B',
      ),
    ).toBeNull();

    fetchMock
      .mockResolvedValueOnce(
        json(200, { resource: { uri: 'https://api.calendly.com/users/ME' } }),
      )
      .mockResolvedValueOnce(
        json(200, {
          collection: [],
          pagination: { next_page: 'https://attacker.example/next' },
        }),
      )
      .mockResolvedValueOnce(
        json(200, { resource: { uri: 'https://api.calendly.com/users/ME' } }),
      )
      .mockResolvedValueOnce(json(200, { collection: [] }));

    for await (const _booking of service.listBookingsSince(new Date())) {
      // No bookings expected.
    }

    const urls: string[] = fetchMock.mock.calls.map((call: unknown[]) =>
      String(call[0]),
    );

    expect(
      urls.every((url) => url.startsWith('https://api.calendly.com/')),
    ).toBe(true);
  });
});
