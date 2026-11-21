/* Project-finding tests: node --test test/
   A made-up repo layout, checked against the rules build_manifest.py uses. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { discover, assemble, assignmentOf } from '../src/projects.js';

const tree = [];
const texts = new Map();
let n = 0;
function file(path, content = '') {
  const sha = `sha${++n}`;
  tree.push({ path, type: 'blob', sha });
  texts.set(sha, content);
}
function dirsFor() {
  const seen = new Set();
  for (const e of tree.slice()) {
    const parts = e.path.split('/');
    for (let i = 1; i < parts.length; i++) {
      const d = parts.slice(0, i).join('/');
      if (!seen.has(d)) { seen.add(d); tree.push({ path: d, type: 'tree', sha: `t-${d}` }); }
    }
  }
}

// A shown sketch inside an assignment folder, with a cover and instructions
file('intro-programming/tiling/david-l-tiling-s25/project.yml',
  'title: Tiled Gears\nstudent: David L.\nyear: 2025\nsemester: spring\nshow: true\nblurb: Gears turn.\ninstructions: Move the mouse.\n');
file('intro-programming/tiling/david-l-tiling-s25/index.html');
file('intro-programming/tiling/david-l-tiling-s25/cover.png');
file('intro-programming/tiling/david-l-tiling-s25/js/p5.js');
file('intro-programming/tiling/assignment.yml', 'title: Tiling Patterns\nblurb: Repeat a tile.\norder: 2\n');
// A sketch with no project.yml yet
file('intro-programming/tiling/anna-f-tiling-f26/index.html');
file('intro-programming/tiling/anna-f-tiling-f26/sketch.js');
// A hidden project straight in a course folder, using the old fields and explicit media
file('data-structures-algorithms/lanai/project.yml',
  'title: Lanai\nstudent: Kekoa M.\nshow: false\nconsent: true\nmedia:\n  - shot.png\n  - type: embed\n    src: https://example.com\n');
file('data-structures-algorithms/lanai/shot.png');
// A broken project.yml
file('ap-csp/broken/project.yml', 'title: [unclosed\n');
// Folders the builder never looks in, and one too deep
file('scripts/x/project.yml', 'show: true\n');
file('.github/y/project.yml', 'show: true\n');
file('_site/intro-programming/z/project.yml', 'show: true\n');
file('intro-programming/a/b/c/d/e/project.yml', 'show: true\n');
// project.yml at depth 4 below the course is still found
file('intro-programming/a/b/c/d/project.yml', 'title: Deep\nshow: true\n');
dirsFor();

const found = discover(tree);
const { projects, assignments } = assemble(found, texts);
const byPath = Object.fromEntries(projects.map(p => [p.path, p]));

test('finds projects in assignment folders and straight in a course folder', () => {
  assert.ok(byPath['intro-programming/tiling/david-l-tiling-s25']);
  assert.ok(byPath['data-structures-algorithms/lanai']);
  assert.ok(byPath['intro-programming/a/b/c/d'], 'four folders below the course');
});

test('skips scripts, .github, _site, and anything deeper than the builder looks', () => {
  const paths = projects.map(p => p.path);
  assert.ok(!paths.some(p => p.startsWith('scripts/') || p.startsWith('.github/') || p.startsWith('_site/')));
  assert.ok(!paths.includes('intro-programming/a/b/c/d/e'), 'inside another project, and too deep');
});

test('reads status, details, assignment, cover and issues', () => {
  const d = byPath['intro-programming/tiling/david-l-tiling-s25'];
  assert.equal(d.status, 'shown');
  assert.equal(d.title, 'Tiled Gears');
  assert.equal(d.student, 'David L.');
  assert.equal(d.semester, 'spring');
  assert.equal(d.assignment, 'tiling');
  assert.equal(d.id, 'david-l-tiling-s25');
  assert.equal(d.cover, 'intro-programming/tiling/david-l-tiling-s25/cover.png');
  assert.equal(d.sketch, true);
  assert.deepEqual(d.issues, []);
});

test('a hidden project: explicit media cover, old fields flagged, missing bits listed', () => {
  const l = byPath['data-structures-algorithms/lanai'];
  assert.equal(l.status, 'hidden');
  assert.equal(l.assignment, '');
  assert.equal(l.cover, 'data-structures-algorithms/lanai/shot.png');
  assert.equal(l.embed, true);
  assert.ok(l.issues.includes('No blurb'));
  assert.ok(l.issues.includes('No instructions'));
  assert.ok(l.issues.includes('Uses the old consent/draft fields'));
});

test('a sketch folder without project.yml shows up as not set up', () => {
  const a = byPath['intro-programming/tiling/anna-f-tiling-f26'];
  assert.equal(a.status, 'not-set-up');
  assert.equal(a.title, 'Anna F Tiling F26');
  assert.deepEqual(a.issues, ['No project.yml yet']);
});

test('a project.yml with a mistake is reported, not fatal', () => {
  const b = byPath['ap-csp/broken'];
  assert.equal(b.status, 'broken');
  assert.match(b.issues[0], /project\.yml has a mistake/);
});

test('assignments get their title from assignment.yml or the folder', () => {
  const intro = assignments['intro-programming'];
  const tiling = intro.find(a => a.id === 'tiling');
  assert.deepEqual({ ...tiling, ymlSha: undefined }, { id: 'tiling', title: 'Tiling Patterns', blurb: 'Repeat a tile.', order: 2, ymlSha: undefined });
  assert.ok(tiling.ymlSha, 'the assignment.yml version, for safe editing');
  assert.equal(intro.find(a => a.id === 'a').title, 'A');
});

test('assignmentOf matches the builder', () => {
  assert.equal(assignmentOf('intro-programming/tiling/x'), 'tiling');
  assert.equal(assignmentOf('data-structures-algorithms/lanai'), '');
});
