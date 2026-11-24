/* Adding a project: names, checks, and the project.yml it writes. node --test test/ */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse } from 'yaml';
import { slugify, folderName, joinNames, termCode, validate, projectYaml, assignmentYaml } from '../src/write.js';

const b64 = s => Buffer.from(s).toString('base64');
const good = (over = {}) => ({
  course: 'intro-programming',
  assignment: { id: 'tiling' },
  kind: 'sketch',
  files: [{ path: 'index.html', data: b64('<html></html>') }, { path: 'sketch.js', data: b64('function setup(){createCanvas(400,400)}') }],
  meta: { title: 'Noa\'s Tiles', students: ['Noa P.'], year: 2026, semester: 'fall', blurb: 'Tiles.', instructions: ['Move the mouse'], links: [], show: false },
  ...over
});
const fails = (body, field) => assert.throws(() => validate(body), e => e.status === 400 && e.extra.field === field, field);

test('folder names follow the repo pattern', () => {
  assert.equal(folderName({ students: ['Noa P.'], assignment: 'tiling', semester: 'fall', year: 2026 }), 'noa-p-tiling-f26');
  assert.equal(folderName({ students: ['Bodhi K', 'Amory H'], assignment: 'cosmic-dust', semester: 'spring', year: 2025 }), 'bodhi-k-amory-h-cosmic-dust-s25');
  assert.equal(folderName({ students: ['José Ñ.'], assignment: '', title: 'My Game!', semester: '', year: null }), 'jose-n-my-game');
  assert.equal(slugify('  Hello, World!! '), 'hello-world');
  assert.equal(termCode('summer', 2027), 'su27');
});

test('student names join the way the repo writes them', () => {
  assert.equal(joinNames(['Noa P.']), 'Noa P.');
  assert.equal(joinNames(['Noa P.', 'Kai L.']), 'Noa P. and Kai L.');
  assert.equal(joinNames(['Lam N', 'Logan C', 'Chase N']), 'Lam N, Logan C, and Chase N');
});

test('a complete sketch passes, with clean values', () => {
  const v = validate(good());
  assert.equal(v.course, 'intro-programming');
  assert.deepEqual(v.assignment, { id: 'tiling', isNew: false });
  assert.equal(v.files.length, 2);
  assert.equal(v.meta.show, false);
});

test('missing or bad details are named by field', () => {
  fails(good({ course: '' }), 'course');
  fails(good({ meta: { ...good().meta, title: '  ' } }), 'title');
  fails(good({ meta: { ...good().meta, students: [] } }), 'students');
  fails(good({ meta: { ...good().meta, year: 26 } }), 'term');
  fails(good({ meta: { ...good().meta, links: [{ label: 'Code', url: 'javascript:alert(1)' }] } }), 'links');
  fails(good({ kind: 'sketch', files: [{ path: 'sketch.js', data: b64('x') }] }), 'files');
  fails(good({ kind: 'link', embed: { src: 'http://not-https.example' } }), 'embed');
  fails(good({ folder: 'Not A Slug' }), 'folder');
});

test('showing a project needs the consent box', () => {
  fails(good({ meta: { ...good().meta, show: true } }), 'consent');
  assert.equal(validate(good({ meta: { ...good().meta, show: true, consent: true } })).meta.show, true);
});

test('file paths: junk dropped, escapes refused, sizes capped', () => {
  const v = validate(good({ files: [...good().files, { path: '__MACOSX/._sketch.js', data: b64('x') }, { path: '.DS_Store', data: b64('x') }] }));
  assert.equal(v.files.length, 2);
  fails(good({ files: [...good().files, { path: '../escape.js', data: b64('x') }] }), 'files');
  fails(good({ files: [...good().files, { path: 'a/.hidden', data: b64('x') }] }), 'files');
  const big = Buffer.alloc(26 * 1024 * 1024).toString('base64');
  fails(good({ files: [...good().files, { path: 'huge.bin', data: big }] }), 'files');
});

test('a new assignment gets a slug and keeps its title', () => {
  const v = validate(good({ assignment: { title: 'Generative Art', blurb: 'Make art with code.' } }));
  assert.deepEqual(v.assignment, { id: 'generative-art', isNew: true, title: 'Generative Art', blurb: 'Make art with code.' });
  assert.deepEqual(parse(assignmentYaml(v.assignment)), { title: 'Generative Art', blurb: 'Make art with code.' });
});

test('project.yml reads back the way build_manifest.py expects', () => {
  const sketch = parse(projectYaml(validate(good({ meta: { ...good().meta, students: ['Noa P.', 'Kai L.'], instructions: ['Click to start', 'Space jumps'] } })), []));
  assert.deepEqual(sketch, {
    title: "Noa's Tiles", student: 'Noa P. and Kai L.', year: 2026, semester: 'fall', show: false,
    blurb: 'Tiles.', instructions: ['Click to start', 'Space jumps']
  });
  const one = parse(projectYaml(validate(good()), []));
  assert.equal(one.instructions, 'Move the mouse');
  assert.ok(!('media' in one), 'a hosted sketch is found by its index.html');

  const link = parse(projectYaml(validate(good({ kind: 'link', files: [], embed: { src: 'https://editor.p5js.org/a/full/X', size: '600x400' } })), ['cover.png']));
  assert.deepEqual(link.media, ['cover.png', { type: 'embed', src: 'https://editor.p5js.org/a/full/X', size: '600x400' }]);
});

test('awkward text survives the round trip', () => {
  const tricky = 'Click: then "drag" — # not a comment\nsecond line';
  const y = parse(projectYaml(validate(good({ meta: { ...good().meta, title: 'Yes: no', blurb: tricky } })), []));
  assert.equal(y.title, 'Yes: no');
  assert.equal(y.blurb, tricky);
});

test('project.yml carries play, code and live only when they differ from the default', () => {
  const plain = parse(projectYaml(validate(good()), []));
  assert.ok(!('play' in plain) && !('code' in plain) && !('live' in plain));
  const set = parse(projectYaml(validate(good({ meta: { ...good().meta, play: false, code: 'none', live: 'https://x.itch.io/g' } })), []));
  assert.equal(set.play, false);
  assert.equal(set.code, false);
  assert.equal(set.live, 'https://x.itch.io/g');
});
