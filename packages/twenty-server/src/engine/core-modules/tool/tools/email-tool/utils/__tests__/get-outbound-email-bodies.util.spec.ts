import { getOutboundEmailBodies } from 'src/engine/core-modules/tool/tools/email-tool/utils/get-outbound-email-bodies.util';

describe('getOutboundEmailBodies', () => {
  it('sends the reply as written when there is no history', () => {
    expect(
      getOutboundEmailBodies({
        plainTextBody: 'Hello',
        sanitizedHtmlBody: '<p>Hello</p>',
      }),
    ).toEqual({ body: 'Hello', html: '<p>Hello</p>' });
  });

  it('adds the quoted history under the reply', () => {
    expect(
      getOutboundEmailBodies({
        plainTextBody: 'Hello',
        sanitizedHtmlBody: '<p>Hello</p>',
        quotedHistory: {
          text: '\n\n> earlier',
          html: '<br><div>earlier</div>',
        },
      }),
    ).toEqual({
      body: 'Hello\n\n> earlier',
      html: '<p>Hello</p><br><div>earlier</div>',
    });
  });
});
