// A tiny stand-in for the Twenty endpoints migrate.mjs uses.
import { createServer } from 'node:http';

export const startMockTwenty = ({ people = [], attachments = [], fields = [], key, newerApi = true }) => {
  const state = {
    people: new Map(people.map((p) => [p.id, structuredClone(p)])),
    attachments,
    fields: structuredClone(fields),
    calls: [],
    rateLimitOnce: true,
  };
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    const body = await new Promise((r) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => r(b ? JSON.parse(b) : undefined)); });
    const send = (status, json) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(json)); };
    state.calls.push(`${req.method} ${url.pathname}`);

    if (url.pathname.startsWith('/signed/')) {
      if (req.headers.authorization) return send(400, { error: 'two auth methods' });
      if (url.searchParams.get('token') !== 'ok') return send(403, {});
      res.writeHead(200); return res.end(`file-${url.pathname.slice(8)}`);
    }
    if (req.headers.authorization !== `Bearer ${key}`) return send(401, { messages: ['bad key'] });

    if (url.pathname === '/metadata') {
      if (body.query.includes('createOneField')) {
        if (state.readOnly) return send(403, { errors: [{ message: 'forbidden' }] });
        state.fields.push({ ...body.variables.input.field, isCustom: true, isActive: true, isSystem: false });
        return send(200, { data: { createOneField: { id: 'f' } } });
      }
      // The Field type has no isCustom; selecting it fails the whole query.
      if (/fieldsList \{[^}]*isCustom|edges \{ node \{ name[^}]*isCustom/.test(body.query)) return send(400, { errors: [{ message: 'Cannot query field "isCustom" on type "Field"' }] });
      if (body.query.includes('fieldsList') && !newerApi) return send(400, { errors: [{ message: 'Cannot query field fieldsList' }] });
      const node = (name, list) => newerApi ? { id: `${name}-obj`, nameSingular: name, fieldsList: list } : { id: `${name}-obj`, nameSingular: name, fields: { edges: list.map((n) => ({ node: n })) } };
      return send(200, { data: { objects: { edges: [
        { node: node('person', state.fields) },
        { node: node('attachment', [{ name: 'targetPerson', type: 'RELATION' }]) },
      ] } } });
    }

    const list = (items, plural) => {
      if (state.rateLimitOnce && plural === 'people') { state.rateLimitOnce = false; res.writeHead(429, { 'retry-after': '0' }); return res.end('{}'); }
      const limit = Number(url.searchParams.get('limit'));
      const after = url.searchParams.get('starting_after');
      const sorted = [...items].sort((a, b) => a.id.localeCompare(b.id));
      const start = after ? sorted.findIndex((i) => i.id === after) + 1 : 0;
      const page = sorted.slice(start, start + limit);
      return send(200, { data: { [plural]: page }, totalCount: items.length, pageInfo: { hasNextPage: start + limit < sorted.length, endCursor: page.at(-1)?.id } });
    };
    const emailTaken = (p, exceptId) => [...state.people.values()].some((o) => o.id !== exceptId && p.emails?.primaryEmail && o.emails?.primaryEmail?.toLowerCase() === p.emails.primaryEmail.toLowerCase());
    const validate = (p) => Object.keys(p).every((k) => k === 'id' || state.fields.some((f) => f.name === k));

    if (req.method === 'GET' && url.pathname === '/rest/people') return list([...state.people.values()], 'people');
    if (req.method === 'GET' && url.pathname === '/rest/attachments') return list(state.attachments, 'attachments');
    if (state.readOnly && req.method !== 'GET') return send(403, { messages: ['read only'] });
    if (req.method === 'POST' && url.pathname === '/rest/batch/people' && url.searchParams.get('upsert') === 'true') {
      if (!state.supportsUpsert || body.some((p) => !validate(p) || emailTaken(p, p.id))) return send(400, { messages: ['upsert not supported'] });
      body.forEach((p) => state.people.set(p.id, { ...state.people.get(p.id), ...p }));
      return send(201, { data: { createPeople: body } });
    }
    if (req.method === 'POST' && url.pathname === '/rest/batch/people') {
      if (body.some((p) => state.people.has(p.id) || emailTaken(p) || !validate(p))) return send(400, { messages: ['duplicate key value'] });
      body.forEach((p) => state.people.set(p.id, p));
      return send(201, { data: { createPeople: body } });
    }
    if (req.method === 'POST' && url.pathname === '/rest/people') {
      if (!validate(body)) return send(400, { messages: ['unknown field'] });
      if (state.people.has(body.id) || emailTaken(body)) return send(400, { messages: ['duplicate key value violates unique constraint'] });
      state.people.set(body.id, body); return send(201, { data: { createPerson: body } });
    }
    const match = url.pathname.match(/^\/rest\/people\/(.+)$/);
    if (req.method === 'PATCH' && match) {
      const existing = state.people.get(match[1]);
      if (!existing) return send(404, { messages: ['not found'] });
      if (emailTaken({ ...existing, ...body }, existing.id)) return send(400, { messages: ['duplicate key value'] });
      state.people.set(match[1], { ...existing, ...body }); return send(200, { data: { updatePerson: existing } });
    }
    send(404, { messages: [`no route ${req.method} ${url.pathname}`] });
  });

  return new Promise((r) => server.listen(0, () => r({ url: `http://127.0.0.1:${server.address().port}`, state, close: () => server.close() })));
};
