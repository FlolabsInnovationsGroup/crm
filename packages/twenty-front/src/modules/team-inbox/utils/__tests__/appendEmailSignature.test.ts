import { appendEmailSignature } from '@/team-inbox/utils/appendEmailSignature';

describe('appendEmailSignature', () => {
  it('adds the signature under the template text, one line per line', () => {
    expect(
      appendEmailSignature(
        '<p>Hi Ada,</p><p>Thanks</p>',
        'HR Team\nFloLabs Innovations Group',
      ),
    ).toBe(
      '<p>Hi Ada,</p><p>Thanks</p><p>HR Team<br>FloLabs Innovations Group</p>',
    );
  });

  it('leaves an empty first line to type on', () => {
    expect(appendEmailSignature('', 'HR Team')).toBe('<p></p><p>HR Team</p>');
  });

  it('shows the signature as text, never as HTML', () => {
    expect(appendEmailSignature('', 'R&D <hr@flolabs.com>')).toBe(
      '<p></p><p>R&amp;D &lt;hr@flolabs.com&gt;</p>',
    );
  });

  it('changes nothing when the mailbox has no signature', () => {
    expect(appendEmailSignature('<p>Hi</p>', null)).toBe('<p>Hi</p>');
    expect(appendEmailSignature('<p>Hi</p>', '  ')).toBe('<p>Hi</p>');
  });
});
