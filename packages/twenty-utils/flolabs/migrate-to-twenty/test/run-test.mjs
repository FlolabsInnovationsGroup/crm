// End-to-end test of migrate.mjs against two fake CRMs: node test/run-test.mjs
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { startMockTwenty } from './mock-twenty.mjs';

const TOOL = new URL('../migrate.mjs', import.meta.url).pathname;
const field = (name, type, extra = {}) => ({ name, label: name, type, isActive: true, isSystem: false, ...extra });
const standard = [field('name', 'FULL_NAME'), field('emails', 'EMAILS'), field('phones', 'PHONES'), field('jobTitle', 'TEXT'), field('city', 'TEXT'), field('position', 'POSITION', { isSystem: true })];
const sourceCustom = [
  field('stage', 'SELECT', { options: [{ id: 'o1', value: 'NEW', label: 'New', color: 'blue', position: 0 }, { id: 'o2', value: 'WEIRD', label: 'Weird', color: 'red', position: 1 }] }),
  field('applicationDate', 'DATE_TIME'),
  field('country', 'TEXT'),
  field('payments', 'RELATION'),
];
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const sourcePeople = Array.from({ length: 450 }, (_, i) => ({
  id: id(i), name: { firstName: `P${i}`, lastName: 'X' }, emails: { primaryEmail: `p${i}@mail.test`, additionalEmails: i === 250 ? ['second@mail.test'] : [] },
  phones: null, jobTitle: '', city: 'Cairo', stage: i === 9 ? 'WEIRD' : 'NEW', applicationDate: '2026-11-01T00:00:00.000Z', country: 'Egypt',
  payments: [{ id: 'nope' }], createdAt: '2026-01-01', position: i,
}));
// Already in the target from the old HubSpot export, under other ids and in upper case.
const targetPeople = [5, 250, 449].map((i) => ({ id: id(100000 + i), name: { firstName: 'Old', lastName: 'Copy' }, emails: { primaryEmail: `P${i}@MAIL.test`, additionalEmails: [] }, city: 'Old', jobTitle: 'Kept' }));
const attachments = [
  { id: 'a1', name: 'cv.pdf', targetPersonId: id(1), file: [{ fileId: 'f1', label: 'cv.pdf', extension: 'pdf' }] },
  { id: 'a2', name: '=cover letter.pdf', targetPersonId: id(2), file: [{ fileId: 'f2', label: 'x', extension: 'pdf' }] },
  { id: 'a3', name: 'nolink.pdf', targetPersonId: id(3), file: [{ fileId: 'f3', label: 'x', extension: 'pdf' }] },
  { id: 'a4', name: 'task.pdf', targetPersonId: null, file: [] },
];
const source = await startMockTwenty({ people: sourcePeople, attachments, fields: [...standard, ...sourceCustom], key: 'read-key' });
source.state.readOnly = true;
source.state.attachments.forEach((a) => { if (a.id !== 'a3' && a.file[0]) a.file[0].url = `${source.url}/signed/${a.id}?token=ok`; });
// The target already has "country" as a select: different type, so not copied.
const target = await startMockTwenty({ people: targetPeople, fields: [...standard, field('country', 'SELECT', { options: [] })], key: 'admin-key', newerApi: false });

const dir = mkdtempSync(join(tmpdir(), 'migrate-'));
const writeConfig = (extra = {}) => writeFileSync(join(dir, 'config.json'), JSON.stringify({ source: { url: source.url, apiKey: 'read-key' }, target: { url: target.url, apiKey: 'admin-key' }, outputFolder: './out', ...extra }));
writeConfig();
const run = async (...args) => (await promisify(execFile)('node', [TOOL, ...args, '--config', join(dir, 'config.json')], { encoding: 'utf8' })).stdout;
const writes = (mock) => mock.state.calls.filter((c) => !c.startsWith('GET') && c !== 'POST /metadata').length;

const checkOut = await run('check');
assert.match(checkOut, /Source: 450 people\. Target: 3 people/);
assert.match(checkOut, /add to the target: stage, applicationDate/);
assert.match(checkOut, /different type.*country \(TEXT here, SELECT in the target\)/);
assert.match(checkOut, /only their empty fields are filled/);
assert.equal(writes(target), 0, 'check must not write');

await run('fields');
assert.ok(target.state.fields.some((f) => f.name === 'stage' && f.options.length === 2));
assert.ok(!target.state.fields.some((f) => f.name === 'payments'), 'relations are not created');
target.state.fields.find((f) => f.name === 'stage').options.pop(); // the target only knows NEW

const trialOut = await run('people', '--limit', '20');
assert.match(trialOut, /19 created, 1 updated/);
assert.equal(target.state.people.size, 22);

const peopleOut = await run('people');
console.log(peopleOut.split('\n').filter((l) => /people:|Not copied|Select values/.test(l)).slice(-4).join('\n'));
assert.match(peopleOut, /country \(TEXT here, SELECT in the target\)/);
assert.match(peopleOut, /stage=WEIRD \(1\)/);
assert.equal(target.state.people.size, 450, 'no duplicates: 447 new + 3 matched');
const old = target.state.people.get(id(100000 + 250));
assert.equal(old.city, 'Old', 'fill-empty keeps their values');
assert.equal(old.jobTitle, 'Kept', 'empty FloLabs values never blank theirs');
assert.equal(old.stage, 'NEW', 'their empty fields are filled');
assert.deepEqual(old.emails.additionalEmails, ['second@mail.test'], 'our extra emails are added');
assert.equal(old.emails.primaryEmail, 'P250@MAIL.test');
const created = target.state.people.get(id(10));
assert.deepEqual(Object.keys(created).sort(), ['applicationDate', 'city', 'emails', 'id', 'jobTitle', 'name', 'phones', 'stage']);
assert.equal(target.state.people.get(id(9)).stage, null);
const map = readFileSync(join(dir, 'out', 'people-map.csv'), 'utf8');
assert.match(map, new RegExp(`"${id(250)}","${id(100250)}","p250@mail.test"`));

await run('files');
const csv = readFileSync(join(dir, 'out', 'files.csv'), 'utf8');
assert.match(csv, /a1.*cv\.pdf/); assert.match(csv, /"'=cover letter\.pdf"/); assert.match(csv, /a3.*no download link/); assert.doesNotMatch(csv, /a4/);
assert.equal(readFileSync(join(dir, 'out', 'files', id(2), 'a2-_cover_letter.pdf'), 'utf8'), 'file-a2');
assert.ok(!existsSync(join(dir, 'out', 'files', id(2), 'a2-_cover_letter.pdf.part')));

// Overwrite mode, run again from the start: nothing duplicated, ours win.
writeConfig({ onExisting: 'overwrite' });
writeFileSync(join(dir, 'out', 'state.json'), '{}');
await run('people');
assert.equal(target.state.people.size, 450);
assert.equal(target.state.people.get(id(100000 + 250)).city, 'Cairo');
assert.equal(target.state.people.get(id(100000 + 250)).jobTitle, 'Kept');
assert.equal(writes(source), 0, 'source never written');
console.log('ALL MIGRATION TESTS PASSED');
source.close(); target.close();
