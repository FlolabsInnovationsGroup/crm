// End-to-end test of migrate.mjs against two fake CRMs: node test/run-test.mjs
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { startMockTwenty } from './mock-twenty.mjs';

const TOOL = new URL('../migrate.mjs', import.meta.url).pathname;
const standard = ['name', 'emails', 'phones', 'jobTitle', 'city'].map((name) => ({ name, type: name === 'name' ? 'FULL_NAME' : name === 'emails' ? 'EMAILS' : name === 'phones' ? 'PHONES' : 'TEXT', isCustom: false, isActive: true, isSystem: false }));
const custom = [
  { name: 'stage', label: 'Stage', type: 'SELECT', isCustom: true, isActive: true, isSystem: false, options: [{ value: 'NEW', label: 'New', color: 'blue', position: 0 }] },
  { name: 'applicationDate', label: 'Application Date', type: 'DATE_TIME', isCustom: true, isActive: true, isSystem: false },
  { name: 'payments', label: 'Payments', type: 'RELATION', isCustom: true, isActive: true, isSystem: false },
];
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const sourcePeople = Array.from({ length: 450 }, (_, i) => ({
  id: id(i), name: { firstName: `P${i}`, lastName: 'X' }, emails: { primaryEmail: `p${i}@mail.test`, additionalEmails: [] },
  phones: null, jobTitle: '', city: 'Cairo', stage: 'NEW', applicationDate: '2026-11-01T00:00:00.000Z', payments: [{ id: 'nope' }],
  createdAt: '2026-01-01', updatedAt: '2026-01-02', deletedAt: null, createdBy: { source: 'API' }, position: i,
}));
// Already in the target from the old HubSpot export, under other ids and in upper case.
const targetPeople = [5, 250, 449].map((i) => ({ id: id(100000 + i), name: { firstName: 'Old', lastName: 'Copy' }, emails: { primaryEmail: `P${i}@MAIL.test` }, city: 'Old' }));
const attachments = [
  { id: 'a1', name: 'cv.pdf', targetPersonId: id(1), file: [{ fileId: 'f1', label: 'cv.pdf', extension: 'pdf' }] },
  { id: 'a2', name: 'cover letter.pdf', targetPersonId: id(2), file: [{ fileId: 'f2', label: 'x', extension: 'pdf' }] },
  { id: 'a3', name: 'nolink.pdf', targetPersonId: id(3), file: [{ fileId: 'f3', label: 'x', extension: 'pdf' }] },
  { id: 'a4', name: 'task.pdf', targetPersonId: null, file: [] },
];
const source = await startMockTwenty({ people: sourcePeople, attachments, fields: [...standard, ...custom], key: 'read-key' });
source.state.readOnly = true;
source.state.attachments.forEach((a) => { if (a.id !== 'a3' && a.file[0]) a.file[0].url = `${source.url}/signed/${a.id}?token=ok`; });
const target = await startMockTwenty({ people: targetPeople, fields: standard, key: 'admin-key', newerApi: false });

const dir = mkdtempSync(join(tmpdir(), 'migrate-'));
writeFileSync(join(dir, 'config.json'), JSON.stringify({ source: { url: source.url, apiKey: 'read-key' }, target: { url: target.url, apiKey: 'admin-key' }, outputFolder: './out' }));
const run = async (step) => (await promisify(execFile)('node', [TOOL, step, '--config', join(dir, 'config.json')], { encoding: 'utf8' })).stdout;

const checkOut = await run('check');
assert.match(checkOut, /Source: 450 people\. Target: 3 people/);
assert.match(checkOut, /stage, applicationDate/);
assert.equal(target.state.calls.filter((c) => !c.startsWith('GET') && c !== 'POST /metadata').length, 0, 'check must not write');

const allOut = await run('all');
console.log(allOut.split('\n').filter((l) => /people:|files:|field|Not copied|failed/.test(l)).slice(-6).join('\n'));
assert.equal(target.state.people.size, 450 + 3 - 3, 'no duplicates: 447 new + 3 updated');
const updated = [...target.state.people.values()].find((p) => p.id === id(100000 + 250));
assert.equal(updated.city, 'Cairo'); assert.equal(updated.stage, 'NEW');
const created = target.state.people.get(id(10));
assert.deepEqual(Object.keys(created).sort(), ['applicationDate', 'city', 'emails', 'id', 'jobTitle', 'name', 'phones', 'stage'].sort());
assert.ok(target.state.fields.some((f) => f.name === 'stage' && f.options?.length === 1));
assert.ok(!target.state.fields.some((f) => f.name === 'payments'), 'relations are not created');
const csv = readFileSync(join(dir, 'out', 'files.csv'), 'utf8');
assert.match(csv, /a1.*cv\.pdf/); assert.match(csv, /a3.*no download link/); assert.doesNotMatch(csv, /a4/);
assert.equal(readFileSync(join(dir, 'out', 'files', id(2), 'a2-cover_letter.pdf'), 'utf8'), 'file-a2');

// Run again: nothing duplicated, everything updated in place, first one by
// one, then with upsert batches where the target supports them.
writeFileSync(join(dir, 'out', 'state.json'), '{}');
await run('people');
assert.equal(target.state.people.size, 450);
target.state.supportsUpsert = true;
target.state.people.get(id(7)).city = 'Changed';
writeFileSync(join(dir, 'out', 'state.json'), '{}');
const upsertOut = await run('people');
assert.match(upsertOut, /0 created, 450 updated, 0 failed/);
assert.equal(target.state.people.get(id(7)).city, 'Cairo');
assert.equal(target.state.people.size, 450);
assert.equal(source.state.calls.filter((c) => !c.startsWith('GET') && c !== 'POST /metadata').length, 0, 'source never written');
console.log('ALL MIGRATION TESTS PASSED');
source.close(); target.close();
