import { importFormHtml } from '@/form-builder/utils/importFormHtml';

describe('importFormHtml', () => {
  it('turns a pasted form into fields and renames its inputs', () => {
    const { fields, html } = importFormHtml(`
      <form action="https://example.com/collect" onsubmit="steal()">
        <label for="fn">First name *</label>
        <input id="fn" name="firstname" required>
        <label>Email <input type="email" name="email"></label>
        <select name="team"><option value="">Pick</option><option value="ai">AI</option></select>
        <fieldset><legend>Seniority</legend>
          <label><input type="radio" name="level" value="jr"> Junior</label>
          <label><input type="radio" name="level" value="sr"> Senior</label>
        </fieldset>
        <textarea name="1-notes" placeholder="Anything else?"></textarea>
        <script>alert(1)</script>
        <button type="submit">Send</button>
      </form>`);

    expect(
      fields.map(({ id, type, label, required }) => ({
        id,
        type,
        label,
        required,
      })),
    ).toEqual([
      {
        id: 'firstname',
        type: 'shortText',
        label: 'First name',
        required: true,
      },
      { id: 'email', type: 'email', label: 'Email', required: false },
      { id: 'team', type: 'select', label: 'team', required: false },
      { id: 'level', type: 'select', label: 'Seniority', required: false },
      {
        id: 'notes',
        type: 'longText',
        label: 'Anything else?',
        required: false,
      },
    ]);
    expect(fields[3]?.options).toEqual([
      { value: 'jr', label: 'Junior' },
      { value: 'sr', label: 'Senior' },
    ]);
    expect(html).toContain('name="notes"');
    expect(html).not.toMatch(/script|onsubmit|<button|action=/);
  });
});
