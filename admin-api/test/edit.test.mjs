/* Editing: reading names back, and changing project.yml without losing anything. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse } from 'yaml';
import { splitNames, updatedYaml } from '../src/edit.js';
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
