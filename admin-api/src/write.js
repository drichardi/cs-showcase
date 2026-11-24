/* Adding a project: check what the dashboard sent, write project.yml (and
   assignment.yml for a new assignment), and save it all to the repo as one commit
   recorded under the signed-in teacher. */
import { stringify } from 'yaml';
import { gh } from './github.js';
import { HttpError } from './http.js';

export const LIMITS = { totalBytes: 25 * 1024 * 1024, binaryFiles: 40, files: 300 };
export const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SEMESTERS = ['spring', 'summer', 'fall'];
export const JUNK = /(^|\/)(__MACOSX|\.DS_Store|Thumbs\.db|desktop\.ini)(\/|$)/i;
export const PICTURE = /\.(png|jpe?g|webp|gif|svg|avif|mp4|webm|mov)$/i;
export const SEGMENT = /^[\w\-. ()+@,]+$/;

/* ---------- names ---------- */

export function slugify(s, max = 60) {
  return String(s ?? '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, max).replace(/-+$/, '');
}

export function termCode(semester, year) {
  const s = { spring: 's', summer: 'su', fall: 'f' }[semester] || '';
  return year ? `${s}${String(year).slice(-2)}` : s;
}

/* The repo's folder pattern: students, assignment, term -> "noa-p-tiling-f26". */
export function folderName({ students, assignment, title, semester, year }) {
  const who = students.map(n => slugify(n)).filter(Boolean).join('-');
  return slugify([who, assignment || slugify(title, 30), termCode(semester, year)].filter(Boolean).join('-'), 80);
}

/* "Noa P." / "Noa P. and Kai L." / "Lam N, Logan C, and Chase N" */
export function joinNames(names) {
  if (names.length <= 2) return names.join(' and ');
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
}

/* ---------- checking what was sent ---------- */

const bad = (field, message) => new HttpError(400, 'invalid', message, { field });
const str = v => (typeof v === 'string' ? v.trim() : '');

export function validate(body) {
  if (!body || typeof body !== 'object') throw bad('', 'Nothing was sent.');
  const course = str(body.course);
  if (!SLUG.test(course)) throw bad('course', 'Pick a course.');

  let assignment = null;
  if (body.assignment && typeof body.assignment === 'object') {
    if (body.assignment.id !== undefined) {
      const id = str(body.assignment.id);
      if (id && !SLUG.test(id)) throw bad('assignment', 'That assignment name isn\'t valid.');
      assignment = id ? { id, isNew: false } : null;
    } else {
      const title = str(body.assignment.title);
      const id = slugify(title, 40);
      if (!id) throw bad('assignment', 'Give the new assignment a name.');
      if (title.length > 60) throw bad('assignment', 'Keep the assignment name under 60 characters.');
      const blurb = str(body.assignment.blurb);
      if (blurb.length > 300) throw bad('assignment', 'Keep the assignment description under 300 characters.');
      assignment = { id, isNew: true, title, blurb };
    }
  }

  const meta = validateMeta(body.meta);
  const kind = str(body.kind);
  if (!['sketch', 'link', 'media'].includes(kind)) throw bad('kind', 'Add the sketch, a link, or pictures.');
  const embed = kind === 'link' ? validateEmbed(body.embed) : null;

  const files = cleanFiles(body.files);
  if (kind === 'sketch' && !files.some(f => f.path === 'index.html')) throw bad('files', 'The sketch needs an index.html.');
  if (kind === 'media' && !files.some(f => PICTURE.test(f.path))) throw bad('files', 'Add at least one picture or video.');
  const cover = validateCover(body.cover);

  const folder = str(body.folder);
  if (folder && !SLUG.test(folder)) throw bad('folder', 'The folder name can only use lowercase letters, numbers and dashes.');

  return { course, assignment, kind, embed, files, cover, folder, meta };
}

/* The details, the same for adding and editing. */
export function validateMeta(m) {
  m = m || {};
  const title = str(m.title);
  if (!title) throw bad('title', 'Add a title.');
  if (title.length > 100) throw bad('title', 'Keep the title under 100 characters.');
  const students = (Array.isArray(m.students) ? m.students : []).map(str).filter(Boolean);
  if (!students.length) throw bad('students', 'Add at least one student.');
  if (students.length > 8 || students.some(s => s.length > 40)) throw bad('students', 'Up to 8 students, each under 40 characters.');
  const year = m.year == null || m.year === '' ? null : Number(m.year);
  if (year !== null && !(Number.isInteger(year) && year >= 2000 && year <= 2100)) throw bad('term', 'The year should look like 2026.');
  const semester = str(m.semester).toLowerCase();
  if (semester && !SEMESTERS.includes(semester)) throw bad('term', 'Pick spring, summer or fall.');
  const blurb = str(m.blurb);
  if (blurb.length > 400) throw bad('blurb', 'Keep the description under 400 characters.');
  const instructions = (Array.isArray(m.instructions) ? m.instructions : [m.instructions]).map(str).filter(Boolean);
  if (instructions.length > 10 || instructions.some(s => s.length > 200)) throw bad('instructions', 'Up to 10 instructions, each under 200 characters.');
  const links = (Array.isArray(m.links) ? m.links : []).map(l => ({ label: str(l && l.label), url: str(l && l.url) }))
    .filter(l => l.label || l.url);
  if (links.length > 6) throw bad('links', 'Up to 6 links.');
  for (const l of links) {
    if (!l.label || l.label.length > 40) throw bad('links', 'Each link needs a short label.');
    if (!/^https?:\/\/[^\s]+$/i.test(l.url) || l.url.length > 500) throw bad('links', `"${l.label}" needs a full web address (https://…).`);
  }
  const show = m.show === true;
  if (show && m.consent !== true) throw bad('consent', 'Tick the box confirming the students agreed to have this shown, or leave it hidden.');
  // On the site: playable there or not; the code link ('' automatic, 'none', or an
  // address); and an optional "See it in action" address.
  const play = m.play !== false;
  const code = m.code === false || str(m.code) === 'none' ? 'none' : str(m.code);
  if (code && code !== 'none' && (!/^https?:\/\/[^\s]+$/i.test(code) || code.length > 500)) throw bad('code', 'The code link needs a full web address (https://…).');
  const live = str(m.live);
  if (live && (!/^https?:\/\/[^\s]+$/i.test(live) || live.length > 500)) throw bad('live', 'The "See it in action" link needs a full web address (https://…).');
  return { title, students, year, semester, blurb, instructions, links, show, play, code, live };
}

export function validateEmbed(e) {
  const src = str(e && e.src);
  if (!/^https:\/\/[^\s]+$/i.test(src) || src.length > 500) throw bad('embed', 'The link must be a full https:// address.');
  const size = str(e.size);
  if (size && !/^\d{2,5}x\d{2,5}$/.test(size)) throw bad('embed', 'Canvas size should look like 400x400.');
  return { src, size };
}

export function validateCover(c) {
  if (!c || !c.data) return null;
  const ext = (str(c.name).match(/\.([a-z0-9]+)$/i) || [])[1];
  if (!ext || !PICTURE.test(`.${ext}`)) throw bad('cover', 'The cover should be a picture (PNG, JPG, GIF or WebP) or a video.');
  return { path: `cover.${ext.toLowerCase()}`, data: b64(c.data, 'cover') };
}

export function cleanFiles(list) {
  const out = [], seen = new Set();
  let total = 0, binaries = 0;
  for (const f of Array.isArray(list) ? list : []) {
    const path = str(f && f.path).replace(/\\/g, '/').replace(/^\.?\//, '');
    if (!path || JUNK.test(path)) continue;
    const parts = path.split('/');
    if (parts.length > 6 || parts.some(p => !p || p === '.' || p === '..' || p.startsWith('.') || !SEGMENT.test(p))) {
      throw bad('files', `"${path}" has characters a file name can't use here. Rename it and try again.`);
    }
    if (seen.has(path.toLowerCase())) continue;
    seen.add(path.toLowerCase());
    const data = b64(f.data, path);
    total += data.bytes;
    if (!isText(path, data)) binaries++;
    out.push({ path, data });
  }
  if (out.length > LIMITS.files) throw bad('files', `That's ${out.length} files; the most one project can have is ${LIMITS.files}.`);
  if (total > LIMITS.totalBytes) throw bad('files', `That's ${(total / 1048576).toFixed(1)} MB; one project can be up to 25 MB. A bigger game belongs on itch.io, added here as a link.`);
  if (binaries > LIMITS.binaryFiles) throw bad('files', `That's ${binaries} pictures and sounds; one project can have up to ${LIMITS.binaryFiles}.`);
  return out;
}

export function b64(value, what) {
  const s = str(value);
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(s)) throw bad('files', `"${what}" didn't upload properly. Try again.`);
  return { base64: s, bytes: Math.floor(s.length * 3 / 4) - (s.endsWith('==') ? 2 : s.endsWith('=') ? 1 : 0) };
}

/* Text files go straight into the commit; anything that isn't valid UTF-8 is binary. */
export function isText(path, data) {
  if (PICTURE.test(path)) return false;
  if (data.text !== undefined) return data.text !== null;
  try {
    const bytes = Uint8Array.from(atob(data.base64), c => c.charCodeAt(0));
    data.text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch (e) { data.text = null; }
  return data.text !== null;
}

/* ---------- project.yml ---------- */

export function projectYaml(v, pictures) {
  const doc = { title: v.meta.title, student: joinNames(v.meta.students) };
  if (v.meta.year) doc.year = v.meta.year;
  if (v.meta.semester) doc.semester = v.meta.semester;
  doc.show = v.meta.show;
  if (v.meta.blurb) doc.blurb = v.meta.blurb;
  if (v.meta.instructions.length === 1) doc.instructions = v.meta.instructions[0];
  else if (v.meta.instructions.length) doc.instructions = v.meta.instructions;
  if (v.meta.links.length) doc.links = v.meta.links;
  if (v.meta.play === false) doc.play = false;
  if (v.meta.code === 'none') doc.code = false;
  else if (v.meta.code) doc.code = v.meta.code;
  if (v.meta.live) doc.live = v.meta.live;
  if (v.kind === 'link') {
    // Listing media turns off the builder's own picture search, so list the pictures too.
    doc.media = [...pictures, { type: 'embed', src: v.embed.src, ...(v.embed.size ? { size: v.embed.size } : {}) }];
  }
  return '# Added with the CS teacher dashboard. Edit it there, or here by hand.\n' + stringify(doc, { lineWidth: 0 });
}

export function assignmentYaml(a) {
  const doc = { title: a.title };
  if (a.blurb) doc.blurb = a.blurb;
  return '# Added with the CS teacher dashboard.\n' + stringify(doc, { lineWidth: 0 });
}

/* ---------- saving ---------- */

export async function createProject(request, env, user) {
  const v = validate(await request.json().catch(() => null));
  const branch = env.GITHUB_BRANCH;
  const write = { access: 'write' };

  const head = (await gh(env, `/git/ref/heads/${encodeURIComponent(branch)}`, write)).object.sha;

  // The course must exist; an assignment that already has a folder is reused.
  const courseList = await listDir(env, v.course, head);
  if (!courseList) throw bad('course', "That course doesn't have a folder in the repo.");
  let assignment = v.assignment;
  if (assignment && assignment.isNew && courseList.includes(assignment.id)) assignment = { ...assignment, isNew: false };
  const dir = assignment ? `${v.course}/${assignment.id}` : v.course;
  const taken = new Set(!assignment ? courseList : assignment.isNew ? [] : (await listDir(env, dir, head)) || []);

  // A free folder name: the one asked for, or the pattern, with -2, -3… if taken.
  const base = v.folder || folderName({ students: v.meta.students, assignment: assignment && assignment.id, ...v.meta });
  let folder = base, n = 2;
  while (taken.has(folder)) folder = `${base}-${n++}`;
  const path = `${dir}/${folder}`;

  // Files: uploaded ones, the cover, project.yml, and assignment.yml for a new assignment.
  const files = v.files.slice();
  if (v.cover) {
    for (let i = files.length - 1; i >= 0; i--) if (/^cover\.[a-z0-9]+$/i.test(files[i].path)) files.splice(i, 1);
    files.push({ path: v.cover.path, data: v.cover.data });
  }
  const pictures = files.map(f => f.path).filter(p => PICTURE.test(p))
    .sort((a, b) => (/^cover\./i.test(b) ? 1 : 0) - (/^cover\./i.test(a) ? 1 : 0) || a.localeCompare(b));
  const entries = [];
  for (const f of files) {
    if (isText(f.path, f.data)) {
      entries.push({ path: `${path}/${f.path}`, mode: '100644', type: 'blob', content: f.data.text });
    } else {
      const blob = await gh(env, '/git/blobs', { ...write, method: 'POST', body: { content: f.data.base64, encoding: 'base64' } });
      entries.push({ path: `${path}/${f.path}`, mode: '100644', type: 'blob', sha: blob.sha });
    }
  }
  entries.push({ path: `${path}/project.yml`, mode: '100644', type: 'blob', content: projectYaml(v, v.kind === 'link' ? pictures : []) });
  if (assignment && assignment.isNew) {
    entries.push({ path: `${dir}/assignment.yml`, mode: '100644', type: 'blob', content: assignmentYaml(assignment) });
  }

  const where = [v.course, assignment && assignment.id].filter(Boolean).join(' / ');
  const message = `Add project: ${v.meta.title} (${where})\n\n` +
    `Added with the CS teacher dashboard by ${user.name} <${user.email}>.` +
    (v.meta.show ? ' Shown on the site; the teacher confirmed the students agreed.' : ' Hidden for now.');

  // Adding only creates new files, so a colleague's save in the meantime can't clash.
  const commit = await saveCommit(env, { parent: head, entries, message, user });
  return { path, folder, commit: commit.sha, branch, published: branch === 'main', show: v.meta.show };
}

/* One commit on the branch, recorded under the teacher. If someone else saved in the
   meantime, it's redone on top of their change; `recheck(newHead)` can stop that
   (by throwing) when their change touched the same project. */
export async function saveCommit(env, { parent, entries, message, user, recheck }) {
  const write = { access: 'write' }, ref = `/git/refs/heads/${encodeURIComponent(env.GITHUB_BRANCH)}`;
  for (let attempt = 1; ; attempt++) {
    const parentCommit = await gh(env, `/git/commits/${parent}`, write);
    const tree = await gh(env, '/git/trees', { ...write, method: 'POST', body: { base_tree: parentCommit.tree.sha, tree: entries } });
    const commit = await gh(env, '/git/commits', { ...write, method: 'POST', body: {
      message, tree: tree.sha, parents: [parent],
      author: { name: user.name, email: user.email, date: new Date().toISOString() }
    } });
    try {
      await gh(env, ref, { ...write, method: 'PATCH', body: { sha: commit.sha, force: false } });
      return commit;
    } catch (e) {
      if (e.githubStatus !== 422 || attempt >= 3) throw e;
      parent = (await gh(env, `/git/ref/heads/${encodeURIComponent(env.GITHUB_BRANCH)}`, write)).object.sha;
      if (recheck) await recheck(parent);
    }
  }
}

/* Names in a repo folder at a commit, or null if the folder doesn't exist. */
export async function listDir(env, dir, ref) {
  try {
    const list = await gh(env, `/contents/${dir.split('/').map(encodeURIComponent).join('/')}?ref=${ref}`, { access: 'write' });
    return Array.isArray(list) ? list.map(x => x.name) : null;
  } catch (e) {
    if (e.githubStatus === 404) return null;
    throw e;
  }
}

/* ---------- publishing status ---------- */

/* After a save on main, the work repo's Action builds and publishes it: about a minute. */
export async function publishStatus(env, sha) {
  if (!/^[0-9a-f]{40}$/.test(sha || '')) throw bad('commit', 'Unknown save.');
  if (env.GITHUB_BRANCH !== 'main') return { state: 'test-branch', branch: env.GITHUB_BRANCH };
  const runs = await gh(env, `/actions/runs?head_sha=${sha}&per_page=5`);
  const run = (runs.workflow_runs || [])[0];
  if (!run) return { state: 'waiting' };
  if (run.status !== 'completed') return { state: 'publishing', url: run.html_url };
  return { state: run.conclusion === 'success' ? 'live' : 'failed', url: run.html_url };
}
