/* Editing: read one project for the edit form, save changes to it, and edit an
   assignment's title and description.

   A save is refused if the project's project.yml changed since the form was opened
   (someone else edited it), so nobody's work is silently overwritten. Edits keep the
   rest of project.yml as it was, comments and unfamiliar fields included. */
import { parse, parseDocument, stringify } from 'yaml';
import { gh } from './github.js';
import { HttpError } from './http.js';
import {
  validateMeta, validateEmbed, validateCover, cleanFiles, isText, joinNames, projectYaml, saveCommit, listDir, slugify, PICTURE
} from './write.js';
import { assignmentOf } from './projects.js';

const META = ['project.yml', 'project.yaml', 'project.json'];
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const bad = (field, message) => new HttpError(400, 'invalid', message, { field });
const str = v => (typeof v === 'string' ? v.trim() : '');
const write = { access: 'write' };

/* "Lam N, Logan C, and Chase N" -> ["Lam N", "Logan C", "Chase N"] */
export function splitNames(s) {
  return String(s ?? '').split(/\s*,\s*(?:and\s+)?|\s+and\s+|\s*&\s*/).map(x => x.trim()).filter(Boolean);
}

function checkPath(path) {
  const p = str(path);
  const parts = p.split('/');
  if (parts.length < 2 || parts.length > 5 || parts.some(x => !x || x.startsWith('.') || !/^[\w\-. ]+$/.test(x))) {
    throw bad('path', "That isn't a project folder.");
  }
  return p;
}
const enc = path => path.split('/').map(encodeURIComponent).join('/');

/* Everything about one folder at the branch head: its files, and project.yml if any. */
async function snapshot(env, path, access = 'read') {
  const head = (await gh(env, `/git/ref/heads/${encodeURIComponent(env.GITHUB_BRANCH)}`, { access })).object.sha;
  const tree = await gh(env, `/git/trees/${head}?recursive=1`, { access });
  const prefix = path + '/';
  const files = tree.tree.filter(e => e.type === 'blob' && e.path.startsWith(prefix))
    .map(e => ({ path: e.path.slice(prefix.length), size: e.size, sha: e.sha }));
  if (!files.length) throw new HttpError(404, 'not_found', "That project's folder isn't in the repo any more. Refresh the list.");
  const metaFile = META.map(n => files.find(f => f.path === n)).find(Boolean) || null;
  let text = '', meta = {}, problem = '';
  if (metaFile) {
    text = await (await gh(env, `/contents/${enc(path)}/${metaFile.path}?ref=${head}`,
      { access, accept: 'application/vnd.github.raw', raw: true })).text();
    try {
      meta = (metaFile.path.endsWith('.json') ? JSON.parse(text) : parse(text)) ?? {};
      if (typeof meta !== 'object' || Array.isArray(meta)) throw new Error('it should be a list of fields');
    } catch (e) {
      problem = `${metaFile.path} has a mistake: ${String(e.message).split('\n')[0]}`;
      meta = {};
    }
  }
  return { head, files, metaFile, text, meta, problem };
}

function kindOf(files, meta) {
  if (files.some(f => f.path === 'index.html')) return 'sketch';
  return Array.isArray(meta.media) && meta.media.some(m => m && m.type === 'embed') ? 'link' : 'media';
}

/* ---------- GET /project?path= ---------- */
export async function readProject(env, rawPath) {
  const path = checkPath(rawPath);
  const s = await snapshot(env, path);
  const m = s.meta;
  const embed = Array.isArray(m.media) ? m.media.find(x => x && x.type === 'embed') : null;
  const list = v => (Array.isArray(v) ? v : [v]).map(x => str(x == null ? '' : String(x))).filter(Boolean);
  const course = path.split('/')[0];
  return {
    path, course, assignment: assignmentOf(path), folder: path.slice(path.lastIndexOf('/') + 1),
    ymlSha: s.metaFile ? s.metaFile.sha : null, metaFile: s.metaFile ? s.metaFile.path : '', problem: s.problem,
    kind: kindOf(s.files, m),
    meta: {
      title: str(m.title == null ? '' : String(m.title)), students: splitNames(m.student),
      year: Number.isInteger(m.year) ? m.year : null, semester: str(m.semester).toLowerCase(),
      show: m.show === true, blurb: str(m.blurb == null ? '' : String(m.blurb)),
      instructions: list(m.instructions),
      links: (Array.isArray(m.links) ? m.links : []).filter(l => l && typeof l === 'object')
        .map(l => ({ label: str(String(l.label ?? '')), url: str(String(l.url ?? '')) })),
      play: m.play !== false,
      code: m.code === false || m.code === 'none' ? 'none' : typeof m.code === 'string' ? str(m.code) : '',
      live: typeof m.live === 'string' ? str(m.live) : ''
    },
    embed: embed ? { src: str(embed.src), size: str(embed.size == null ? '' : String(embed.size)) } : null,
    files: s.files.map(f => ({ path: f.path, size: f.size })),
    cover: (s.files.find(f => /^cover\./i.test(f.path) && PICTURE.test(f.path)) || {}).path || ''
  };
}

/* ---------- POST /project ---------- */

/* project.yml with the new details, keeping everything else (comments included). */
export function updatedYaml(text, meta, { kind, embed, pictures, replaced }) {
  const doc = parseDocument(text);
  if (doc.errors.length) throw new Error(doc.errors[0].message);
  const put = (k, v) => (v == null || v === '' || (Array.isArray(v) && !v.length)) ? doc.delete(k) : doc.set(k, v);
  put('title', meta.title);
  put('student', joinNames(meta.students));
  put('year', meta.year);
  put('semester', meta.semester);
  doc.set('show', meta.show);
  put('blurb', meta.blurb);
  put('instructions', meta.instructions.length === 1 ? meta.instructions[0] : meta.instructions);
  put('links', meta.links);
  meta.play === false ? doc.set('play', false) : doc.delete('play');
  meta.code === 'none' ? doc.set('code', false) : put('code', meta.code);
  put('live', meta.live);
  doc.delete('consent');            // replaced by show
  doc.delete('draft');
  if (kind === 'link') doc.set('media', [...pictures, { type: 'embed', src: embed.src, ...(embed.size ? { size: embed.size } : {}) }]);
  else if (replaced) doc.delete('media');   // new files: let the builder find them
  return doc.toString({ lineWidth: 0 });
}

export async function updateProject(request, env, user) {
  const body = await request.json().catch(() => null);
  if (!body) throw bad('', 'Nothing was sent.');
  const path = checkPath(body.path);
  const meta = validateMeta(body.meta);
  const replace = Array.isArray(body.replace) ? cleanFiles(body.replace) : null;
  const cover = validateCover(body.cover);
  const removeCover = body.removeCover === true && !cover;

  const s = await snapshot(env, path, 'write');
  const expected = body.ymlSha ?? null, actual = s.metaFile ? s.metaFile.sha : null;
  const conflict = () => new HttpError(409, 'conflict',
    'Someone else changed this project since you opened it. Go back to the list to see their changes, then edit again.');
  if (expected !== actual) throw conflict();

  let kind = kindOf(s.files, s.meta);
  if (replace) {
    kind = replace.some(f => f.path === 'index.html') ? 'sketch' : 'media';
    if (!replace.length) throw bad('files', 'Add the new files.');
    if (kind === 'media' && !replace.some(f => PICTURE.test(f.path))) throw bad('files', 'Add at least one picture or video.');
  }
  const embed = kind === 'link' ? validateEmbed(body.embed || (Array.isArray(s.meta.media) && s.meta.media.find(m => m && m.type === 'embed'))) : null;

  // Replacing the work swaps every file but project.yml. The cover stays unless a new
  // one is uploaded, the new files bring their own cover.*, or it's removed.
  const entries = [], gone = new Set(), added = new Map();
  const isCover = p => /^cover\.[a-z0-9]+$/i.test(p);
  let newCover = cover;
  if (replace) {
    const ownCover = replace.find(f => isCover(f.path));
    if (!newCover && !removeCover && ownCover) newCover = ownCover;
    for (const f of s.files) if (!META.includes(f.path) && !isCover(f.path)) gone.add(f.path);
    for (const f of replace) if (!isCover(f.path)) added.set(f.path, f);
  }
  if (newCover || removeCover) for (const f of s.files) if (isCover(f.path)) gone.add(f.path);
  if (newCover) added.set(newCover.path, newCover);
  for (const p of added.keys()) gone.delete(p);

  for (const p of gone) entries.push({ path: `${path}/${p}`, mode: '100644', type: 'blob', sha: null });
  for (const [p, f] of added) {
    if (isText(p, f.data)) entries.push({ path: `${path}/${p}`, mode: '100644', type: 'blob', content: f.data.text });
    else {
      const blob = await gh(env, '/git/blobs', { ...write, method: 'POST', body: { content: f.data.base64, encoding: 'base64' } });
      entries.push({ path: `${path}/${p}`, mode: '100644', type: 'blob', sha: blob.sha });
    }
  }

  // The pictures left in the folder, cover first (a link's project.yml lists them).
  const remaining = [...s.files.map(f => f.path).filter(p => !gone.has(p)), ...added.keys()];
  const pictures = [...new Set(remaining)].filter(p => PICTURE.test(p))
    .sort((a, b) => (isCover(b) ? 1 : 0) - (isCover(a) ? 1 : 0) || a.localeCompare(b));
  const yamlFile = s.metaFile && s.metaFile.path !== 'project.json' ? s.metaFile.path : 'project.yml';
  const text = s.metaFile && !s.problem && s.metaFile.path !== 'project.json'
    ? updatedYaml(s.text, meta, { kind, embed, pictures: kind === 'link' ? pictures : [], replaced: !!replace })
    : projectYaml({ meta, kind, embed }, kind === 'link' ? pictures : []);
  entries.push({ path: `${path}/${yamlFile}`, mode: '100644', type: 'blob', content: text });
  if (s.metaFile && s.metaFile.path === 'project.json') entries.push({ path: `${path}/project.json`, mode: '100644', type: 'blob', sha: null });

  // Say what changed, for the repo's history.
  const was = s.meta.show === true;
  const notes = [];
  if (!s.metaFile) notes.push('Set up: project.yml added.');
  else if (s.problem) notes.push(`Rewrote ${s.metaFile.path}, which had a mistake.`);
  if (meta.show !== was) notes.push(meta.show ? 'Now shown on the site; the teacher confirmed the students agreed.' : 'Now hidden from the site.');
  if (replace) notes.push(`Files replaced (${replace.length}).`);
  if (newCover) notes.push('New cover.');
  if (removeCover) notes.push('Cover removed (a screenshot will be made if it\'s a sketch).');
  const verb = !s.metaFile ? 'Set up' : meta.show !== was && notes.length === 1 ? (meta.show ? 'Show' : 'Hide') : 'Update';
  const where = [path.split('/')[0], assignmentOf(path)].filter(Boolean).join(' / ');
  const message = [`${verb} project: ${meta.title} (${where})`, notes.join(' '),
    `Edited with the CS teacher dashboard by ${user.name} <${user.email}>.`].filter(Boolean).join('\n\n');

  const commit = await saveCommit(env, {
    parent: s.head, entries, message, user,
    recheck: async head => {   // a colleague's save landed first: was it this project?
      let sha = null;
      try { sha = (await gh(env, `/contents/${enc(path)}/${yamlFile}?ref=${head}`, write)).sha; }
      catch (e) { if (e.githubStatus !== 404) throw e; }
      if (sha !== actual) throw conflict();
    }
  });
  return { path, folder: path.slice(path.lastIndexOf('/') + 1), commit: commit.sha, branch: env.GITHUB_BRANCH,
    published: env.GITHUB_BRANCH === 'main', show: meta.show };
}

/* ---------- POST /assignment ---------- */
export async function saveAssignment(request, env, user) {
  const body = await request.json().catch(() => null) || {};
  if (body.create === true) return createAssignment(body, env, user);
  const course = str(body.course), id = str(body.id);
  if (!SLUG.test(course) || !SLUG.test(id)) throw bad('assignment', "That isn't an assignment folder.");
  const title = str(body.title), blurb = str(body.blurb);
  if (!title) throw bad('title', 'Give the assignment a name.');
  if (title.length > 60) throw bad('title', 'Keep the name under 60 characters.');
  if (blurb.length > 300) throw bad('blurb', 'Keep the description under 300 characters.');
  const order = body.order === '' || body.order == null ? null : Number(body.order);
  if (order !== null && !Number.isInteger(order)) throw bad('order', 'The order should be a whole number.');

  const head = (await gh(env, `/git/ref/heads/${encodeURIComponent(env.GITHUB_BRANCH)}`, write)).object.sha;
  let list;
  try { list = await gh(env, `/contents/${course}/${id}?ref=${head}`, write); }
  catch (e) { if (e.githubStatus === 404) throw new HttpError(404, 'not_found', "That assignment's folder isn't in the repo."); throw e; }
  const current = Array.isArray(list) ? list.find(f => f.name === 'assignment.yml') : null;
  if (body.ymlSha !== undefined && (body.ymlSha ?? null) !== (current ? current.sha : null)) {
    throw new HttpError(409, 'conflict', 'Someone else changed this assignment since you opened it. Refresh the list, then edit again.');
  }
  let text;
  if (current) {
    const raw = await (await gh(env, `/contents/${course}/${id}/assignment.yml?ref=${head}`,
      { ...write, accept: 'application/vnd.github.raw', raw: true })).text();
    const doc = parseDocument(raw);
    if (doc.errors.length) text = null;
    else {
      doc.set('title', title);
      blurb ? doc.set('blurb', blurb) : doc.delete('blurb');
      order !== null ? doc.set('order', order) : doc.delete('order');
      text = doc.toString({ lineWidth: 0 });
    }
  }
  if (!text) {
    const doc = { title };
    if (blurb) doc.blurb = blurb;
    if (order !== null) doc.order = order;
    text = '# Edited with the CS teacher dashboard.\n' + stringify(doc, { lineWidth: 0 });
  }
  const commit = await saveCommit(env, {
    parent: head, user,
    entries: [{ path: `${course}/${id}/assignment.yml`, mode: '100644', type: 'blob', content: text }],
    message: `Update assignment: ${title} (${course})\n\nEdited with the CS teacher dashboard by ${user.name} <${user.email}>.`
  });
  return { course, id, commit: commit.sha, branch: env.GITHUB_BRANCH, published: env.GITHUB_BRANCH === 'main' };
}

/* A new assignment on its own, before any work is added: just its assignment.yml
   (title, description, order) in a new folder in the course. */
async function createAssignment(body, env, user) {
  const course = str(body.course), title = str(body.title), blurb = str(body.blurb);
  if (!SLUG.test(course)) throw bad('course', 'Pick a course.');
  if (!title) throw bad('title', 'Give the assignment a name.');
  if (title.length > 60) throw bad('title', 'Keep the name under 60 characters.');
  if (blurb.length > 300) throw bad('blurb', 'Keep the description under 300 characters.');
  const order = body.order === '' || body.order == null ? null : Number(body.order);
  if (order !== null && !Number.isInteger(order)) throw bad('order', 'The order should be a whole number.');
  const id = slugify(title, 40);
  if (!id) throw bad('title', 'Give the assignment a name with some letters or numbers in it.');

  const head = (await gh(env, `/git/ref/heads/${encodeURIComponent(env.GITHUB_BRANCH)}`, write)).object.sha;
  const courseList = await listDir(env, course, head);
  if (!courseList) throw bad('course', "That course doesn't have a folder in the repo yet.");
  if (courseList.includes(id)) {
    throw new HttpError(409, 'exists', `This course already has a folder called "${id}". If it's an assignment, pick it from the list and edit it there.`);
  }
  const doc = { title };
  if (blurb) doc.blurb = blurb;
  if (order !== null) doc.order = order;
  const commit = await saveCommit(env, {
    parent: head, user,
    entries: [{ path: `${course}/${id}/assignment.yml`, mode: '100644', type: 'blob',
      content: '# Added with the CS teacher dashboard.\n' + stringify(doc, { lineWidth: 0 }) }],
    message: `Add assignment: ${title} (${course})\n\nAdded with the CS teacher dashboard by ${user.name} <${user.email}>.`
  });
  return { course, id, created: true, commit: commit.sha, branch: env.GITHUB_BRANCH, published: env.GITHUB_BRANCH === 'main' };
}
