/* Editing: reading names back, and changing project.yml without losing anything. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse } from 'yaml';
import { splitNames, updatedYaml, assignmentText } from '../src/edit.js';
import { validateMeta } from '../src/write.js';

const meta = (over = {}) => validateMeta({
  title: 'Tiled Gears', students: ['David L.'], year: 2025, semester: 'spring',
  blurb: 'Gears turn.', instructions: ['Move the mouse'], links: [], show: false, ...over
});

test('student names split the way the repo writes them', () => {
  assert.deepEqual(splitNames('Lam N, Logan C, and Chase N'), ['Lam N', 'Logan C', 'Chase N']);
  assert.deepEqual(splitNames('Bodhi K and Amory H'), ['Bodhi K', 'Amory H']);
  assert.deepEqual(splitNames('Noa P.'), ['Noa P.']);
  assert.deepEqual(splitNames('A & B'), ['A', 'B']);
  assert.deepEqual(splitNames(null), []);
});

const original = `# Copy this file into any new project folder and edit it.
title:   Old Title
student: David L.          # first name + last initial
year:    2025
semester: spring
consent: true              # student agreed
draft: false
blurb:   Old words.
favorite_color: teal       # a field the dashboard doesn't know
media:
  - cover.png
`;

test('an edit keeps comments and unknown fields, and drops consent/draft', () => {
  const out = updatedYaml(original, meta({ title: 'Tiled Gears', show: true, consent: true }), { kind: 'sketch', pictures: [], replaced: false });
  const y = parse(out);
  assert.equal(y.title, 'Tiled Gears');
  assert.equal(y.show, true);
  assert.equal(y.favorite_color, 'teal');
  assert.deepEqual(y.media, ['cover.png'], 'untouched without new files');
  assert.ok(!('consent' in y) && !('draft' in y));
  assert.match(out, /^# Copy this file into any new project folder/);
  assert.match(out, /# first name \+ last initial/);
  assert.match(out, /# a field the dashboard doesn't know/);
});

test('emptied fields are removed; lists and single lines are written naturally', () => {
  const y = parse(updatedYaml(original, meta({ blurb: '', instructions: ['Click', 'Drag'], year: null, semester: '' }),
    { kind: 'sketch', pictures: [], replaced: false }));
  assert.ok(!('blurb' in y) && !('year' in y) && !('semester' in y));
  assert.deepEqual(y.instructions, ['Click', 'Drag']);
});

test('new files clear an old media list; a link rewrites it with the embed', () => {
  assert.ok(!('media' in parse(updatedYaml(original, meta(), { kind: 'sketch', pictures: [], replaced: true }))));
  const link = parse(updatedYaml(original, meta(), {
    kind: 'link', embed: { src: 'https://scratch.mit.edu/projects/1/embed', size: '' }, pictures: ['cover.png'], replaced: false
  }));
  assert.deepEqual(link.media, ['cover.png', { type: 'embed', src: 'https://scratch.mit.edu/projects/1/embed' }]);
});

test('a broken project.yml is reported instead of guessed at', () => {
  assert.throws(() => updatedYaml('title: [oops\n', meta(), { kind: 'sketch', pictures: [] }));
});

test('play, code and live: written only when set, and removed again', () => {
  let out = updatedYaml(original, meta({ play: false, code: 'https://github.com/x/y', live: 'https://x.itch.io/game' }), { kind: 'sketch', pictures: [], replaced: false });
  let y = parse(out);
  assert.equal(y.play, false);
  assert.equal(y.code, 'https://github.com/x/y');
  assert.equal(y.live, 'https://x.itch.io/game');
  out = updatedYaml(out, meta({ code: 'none' }), { kind: 'sketch', pictures: [], replaced: false });
  y = parse(out);
  assert.equal(y.code, false, 'no code link');
  assert.ok(!('play' in y), 'playable is the default, so not written');
  assert.ok(!('live' in y));
  out = updatedYaml(out, meta({}), { kind: 'sketch', pictures: [], replaced: false });
  assert.ok(!('code' in parse(out)), 'automatic again');
});

test('play, code and live are checked', () => {
  assert.equal(meta({}).play, true);
  assert.equal(meta({ play: false }).play, false);
  assert.equal(meta({ code: false }).code, 'none');
  assert.throws(() => meta({ code: 'javascript:alert(1)' }), e => e.extra.field === 'code');
  assert.throws(() => meta({ live: 'itch.io/game' }), e => e.extra.field === 'live');
});

test('assignment.yml: show is switched without losing anything else', () => {
  const raw = '# Tiling, spring and fall.\ntitle: Tiling\nblurb: Repeat a tile. # short\norder: 2\ncolor: teal\n';
  const off = assignmentText(raw, { title: 'Tiling', blurb: 'Repeat a tile.', order: 2, show: false });
  assert.equal(parse(off).show, false);
  assert.match(off, /# Tiling, spring and fall\./);
  assert.equal(parse(off).color, 'teal');
  const on = assignmentText(off, { title: 'Tiling', blurb: 'Repeat a tile.', order: 2, show: true });
  assert.ok(!('show' in parse(on)), 'on is the default, so not written');
  const kept = assignmentText(off, { title: 'Tiling Patterns', blurb: '', order: null });
  assert.equal(parse(kept).show, false, 'an ordinary edit leaves the switch alone');
  assert.equal(parse(kept).title, 'Tiling Patterns');
  assert.deepEqual(parse(assignmentText(null, { title: 'New', blurb: '', order: null, show: false })), { title: 'New', show: false });
});
