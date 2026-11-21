/* Class sets: checking a set, and the one commit it turns into (against a pretend GitHub). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse } from 'yaml';
import { validateBatch, createBatch, checkBlobs, uploadBlob } from '../src/batch.js';

const A = 'a'.repeat(40), B = 'b'.repeat(40), P5 = 'c'.repeat(40);
const row = (over = {}) => ({
  title: 'Tiles', students: ['Noa P.'], show: false,
  files: [{ path: 'index.html', sha: A }, { path: 'sketch.js', sha: B }, { path: 'libraries/p5.min.js', sha: P5 }],
  ...over
});
const good = (over = {}) => ({
  course: 'intro-programming', assignment: { id: 'tiling' }, year: 2026, semester: 'fall',
  instructions: 'Move the mouse', consent: false, projects: [row(), row({ title: 'Waves', students: ['Kai L.'] })],
  ...over
});
const fails = (body, field, row) => assert.throws(() => validateBatch(body),
  e => e.status === 400 && e.extra.field === field && (row === undefined || e.extra.row === row), field);

test('a good set passes, sharing the term and instructions', () => {
  const v = validateBatch(good());
  assert.equal(v.projects.length, 2);
  assert.deepEqual(v.assignment, { id: 'tiling', isNew: false });
  assert.equal(v.projects[0].meta.year, 2026);
  assert.deepEqual(v.projects[1].meta.instructions, ['Move the mouse']);
  assert.equal(v.projects[0].files.length, 3);
});

test('a new assignment gets a folder name from its title', () => {
  const v = validateBatch(good({ assignment: { title: 'Pattern Tiling!', blurb: 'Repeat a tile.' } }));
  assert.deepEqual(v.assignment, { id: 'pattern-tiling', isNew: true, title: 'Pattern Tiling!', blurb: 'Repeat a tile.' });
  fails(good({ assignment: { title: '   ' } }), 'assignment');
});

test('problems name the row they are in', () => {
  fails(good({ projects: [row(), row({ students: [] })] }), 'students', 1);
  fails(good({ projects: [row({ title: '' })] }), 'title', 0);
  fails(good({ projects: [row(), row({ files: [{ path: 'sketch.js', sha: B }] })] }), 'files', 1);
  fails(good({ projects: [row({ files: [...row().files, { path: '../up.js', sha: A }] })] }), 'files', 0);
  fails(good({ projects: [row({ files: [{ path: 'index.html', sha: 'not-a-sha' }] })] }), 'files', 0);
  fails(good({ projects: [] }), 'projects');
  fails(good({ projects: Array.from({ length: 41 }, () => row()) }), 'projects');
  fails(good({ course: 'Intro Programming' }), 'course');
});

test('showing any project needs the one consent box', () => {
  fails(good({ projects: [row(), row({ show: true })] }), 'consent', 1);
  const v = validateBatch(good({ consent: true, projects: [row(), row({ show: true })] }));
  assert.deepEqual(v.projects.map(p => p.meta.show), [false, true]);
});

test('junk and repeated files are dropped', () => {
  const v = validateBatch(good({ projects: [row({ files: [...row().files,
    { path: '__MACOSX/._sketch.js', sha: A }, { path: './Sketch.js', sha: A }, { path: '.DS_Store', sha: A }] })] }));
  assert.deepEqual(v.projects[0].files.map(f => f.path), ['index.html', 'sketch.js', 'libraries/p5.min.js']);
});

/* ---------- a pretend GitHub ---------- */
function fakeGitHub({ dirs = {}, known = [], branch = 'main' } = {}) {
  const calls = [];
  const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(url), body = init.body ? JSON.parse(init.body instanceof Blob ? await init.body.text() : init.body) : null;
    calls.push({ method: init.method || 'GET', path: u.pathname + u.search, body });
    if (u.pathname.endsWith('/access_tokens')) return reply({ token: 't', expires_at: new Date(Date.now() + 3600e3).toISOString() });
    if (u.pathname === '/graphql') {
      const repository = {};
      for (const [, alias, oid] of body.query.matchAll(/(b\d+): object\(oid: "([0-9a-f]{40})"\)/g)) repository[alias] = known.includes(oid) ? { oid } : null;
      return reply({ data: { repository } });
    }
    const path = u.pathname.replace('/repos/drichardi/cs-student-work', '');
    if (path === `/git/ref/heads/${branch}`) return reply({ object: { sha: 'head1' } });
    if (path.startsWith('/contents/')) {
      const dir = decodeURIComponent(path.slice('/contents/'.length));
      return dirs[dir] ? reply(dirs[dir].map(name => ({ name }))) : reply({ message: 'Not Found' }, 404);
    }
    if (path === '/git/commits/head1') return reply({ tree: { sha: 'tree0' } });
    if (path === '/git/trees') return reply({ sha: 'tree1' });
    if (path === '/git/commits') return reply({ sha: 'commit1' });
    if (path === `/git/refs/heads/${branch}`) return reply({ object: { sha: 'commit1' } });
    if (path === '/git/blobs') return reply({ sha: B });
    return reply({ message: 'unexpected ' + path }, 500);
  };
  return calls;
}
const env = { GITHUB_APP_ID: '1', GITHUB_INSTALLATION_ID: '2', GITHUB_REPO: 'drichardi/cs-student-work', GITHUB_BRANCH: 'main',
  GITHUB_APP_KEY: '' };
const user = { name: 'Teacher One', email: 'teacher.one@punahou.edu' };
const post = body => new Request('https://api.test/x', { method: 'POST', body: JSON.stringify(body) });

// The app JWT needs a real RSA key; make a throwaway one.
const { privateKey } = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048,
  publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
env.GITHUB_APP_KEY = Buffer.from(await crypto.subtle.exportKey('pkcs8', privateKey)).toString('base64');

test('a set becomes one commit: files by id, a project.yml each, free folder names', async () => {
  const calls = fakeGitHub({ dirs: { 'intro-programming': ['tiling'], 'intro-programming/tiling': ['noa-p-tiling-f26', 'assignment.yml'] } });
  const out = await createBatch(post(good({ consent: true, projects: [row({ show: true }), row(), row({ title: 'Waves', students: ['Kai L.', 'Mia K.'] })] })), env, user);
  assert.deepEqual(out.projects.map(p => p.folder), ['noa-p-tiling-f26-2', 'noa-p-tiling-f26-3', 'kai-l-mia-k-tiling-f26']);
  assert.equal(out.commit, 'commit1');
  assert.equal(out.published, true);

  const tree = calls.find(c => c.path.endsWith('/git/trees')).body;
  assert.equal(tree.base_tree, 'tree0');
  const p5 = tree.tree.filter(e => e.path.endsWith('libraries/p5.min.js'));
  assert.equal(p5.length, 3);
  assert.ok(p5.every(e => e.sha === P5 && !('content' in e)), 'shared files are referred to, not re-sent');
  const ymls = tree.tree.filter(e => e.path.endsWith('/project.yml'));
  assert.equal(ymls.length, 3);
  const first = parse(ymls[0].content);
  assert.equal(first.show, true);
  assert.equal(first.instructions, 'Move the mouse');
  assert.equal(parse(ymls[2].content).student, 'Kai L. and Mia K.');
  assert.ok(!tree.tree.some(e => e.path.endsWith('assignment.yml')), 'existing assignment left alone');

  const commit = calls.find(c => c.path.endsWith('/git/commits') && c.method === 'POST').body;
  assert.match(commit.message, /^Add 3 projects \(intro-programming \/ tiling\)/);
  assert.match(commit.message, /- Tiles \(shown\)/);
  assert.equal(commit.author.email, 'teacher.one@punahou.edu');
});

test('a new assignment gets its assignment.yml in the same commit', async () => {
  const calls = fakeGitHub({ dirs: { 'intro-programming': ['tiling'] } });
  const out = await createBatch(post(good({ assignment: { title: 'Generative Art', blurb: 'Rules make pictures.' } })), env, user);
  assert.equal(out.dir, 'intro-programming/generative-art');
  const tree = calls.find(c => c.path.endsWith('/git/trees')).body.tree;
  const a = tree.find(e => e.path === 'intro-programming/generative-art/assignment.yml');
  assert.deepEqual(parse(a.content), { title: 'Generative Art', blurb: 'Rules make pictures.' });
});

test('checking files reports only the ones GitHub lacks', async () => {
  fakeGitHub({ known: [P5] });
  assert.deepEqual(await checkBlobs(post({ shas: [A, P5, B, A] }), env), { missing: [A, B] });
  await assert.rejects(checkBlobs(post({ shas: ['nope'] }), env), e => e.status === 400);
});

test('an upload is passed to GitHub as is, and refused if its id comes back different', async () => {
  const calls = fakeGitHub();
  const data = Buffer.from('x').toString('base64');
  const up = sha => uploadBlob(new Request('https://api.test/blobs', { method: 'POST', body: data }), env, new URL(`https://api.test/blobs?sha=${sha}`));
  assert.deepEqual(await up(B), { sha: B });
  assert.deepEqual(calls.find(c => c.path.endsWith('/git/blobs')).body, { encoding: 'base64', content: data });
  await assert.rejects(up(A), e => e.status === 400);
  await assert.rejects(up('nope'), e => e.status === 400);
  await assert.rejects(uploadBlob(new Request('https://api.test/blobs', { method: 'POST', body: 'eA==","x":"' }), env,
    new URL(`https://api.test/blobs?sha=${B}`)), e => e.status === 400, 'quotes would break out of the JSON');
});

test('small text files can come inline instead of by id', async () => {
  const v = validateBatch(good({ projects: [row({ files: [{ path: 'index.html', content: '<html></html>' }, { path: 'p5.js', sha: P5 }] })] }));
  assert.deepEqual(v.projects[0].files, [{ path: 'index.html', content: '<html></html>' }, { path: 'p5.js', sha: P5 }]);
  const calls = fakeGitHub({ dirs: { 'intro-programming': ['tiling'], 'intro-programming/tiling': [] } });
  await createBatch(post(good({ projects: [row({ files: [{ path: 'index.html', content: '<html></html>' }, { path: 'p5.js', sha: P5 }] })] })), env, user);
  const tree = calls.find(c => c.path.endsWith('/git/trees')).body.tree;
  assert.deepEqual(tree.find(e => e.path.endsWith('/index.html')), { path: 'intro-programming/tiling/noa-p-tiling-f26/index.html', mode: '100644', type: 'blob', content: '<html></html>' });
  fails(good({ projects: [row({ files: [{ path: 'index.html', content: 'x'.repeat(3.1 * 1024 * 1024) }] })] }), 'projects');
});
