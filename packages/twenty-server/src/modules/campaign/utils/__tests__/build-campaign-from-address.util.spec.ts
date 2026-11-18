import { buildCampaignFromAddress } from 'src/modules/campaign/utils/build-campaign-from-address.util';

describe('buildCampaignFromAddress', () => {
  it('builds a quoted name and a lowercased address', () => {
    expect(
      buildCampaignFromAddress({
        fromName: ' Hephaestus ',
        fromLocalPart: 'News',
        fromDomain: 'news.hephaestus.international',
      }),
    ).toBe('"Hephaestus" <news@news.hephaestus.international>');
  });

  it.each([
    ['', 'news'],
    ['Name\r\nBcc: x@y.z', 'news'],
    ['Name', 'a b'],
    ['Name', 'a..b'],
    ['Name', '.news'],
    ['Name', 'news@other.com'],
  ])('refuses name %p with local part %p', (fromName, fromLocalPart) => {
    expect(
      buildCampaignFromAddress({
        fromName,
        fromLocalPart,
        fromDomain: 'news.example.com',
      }),
    ).toBeNull();
  });
});
