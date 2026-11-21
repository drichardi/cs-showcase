/* Adding a class set: many sketches saved as one commit.

   A set of 25 sketches that each bundle a 4.5 MB p5.js is too big for one request,
   so bigger files travel by their git id (SHA-1 of "blob <size>\0<bytes>", worked
   out in the browser):
     1. POST /blobs/check  { shas }     -> which of these the repo doesn't have yet
     2. POST /blobs?sha=…  base64 text  -> upload one missing file (once, however many
                                          sketches share it)
     3. POST /projects/batch            -> one commit; small text files come inline,
                                          the rest by id */
import { graphql, gh, repoParts } from './github.js';
import { HttpError } from './http.js';
import {
  validateMeta, folderName, slugify, projectYaml, assignmentYaml, saveCommit, listDir,
  SLUG, JUNK, SEGMENT, LIMITS
} from './write.js';

const SHA = /^[0-9a-f]{40}$/;
export const BATCH = { projects: 40, entries: 3000, inline: 3 * 1024 * 1024 };
const bad = (field, message, extra = {}) => new HttpError(400, 'invalid', message, { field, ...extra });
const str = v => (typeof v === 'string' ? v.trim() : '');

/* ---------- 1. which files are new ---------- */
export async function checkBlobs(request, env) {
  const body = await request.json().catch(() => ({}));
  const shas = [...new Set((Array.isArray(body.shas) ? body.shas : []).map(String))];
  if (!shas.length || shas.length > 2000 || shas.some(s => !SHA.test(s))) throw bad('shas', 'Those file ids look wrong.');
  const { owner, name } = repoParts(env);
  const missing = [];
  for (let i = 0; i < shas.length; i += 100) {
    const chunk = shas.slice(i, i + 100);
    const data = await graphql(env, `query($owner: String!, $name: String!) { repository(owner: $owner, name: $name) {
      ${chunk.map((s, j) => `b${j}: object(oid: "${s}") { oid }`).join('\n')} } }`, { owner, name });
    chunk.forEach((s, j) => { if (!data.repository[`b${j}`]) missing.push(s); });
  }
  return { missing };
}

/* ---------- 2. upload one file ---------- */
/* The body is the file as base64 text, passed to GitHub without being parsed or
   copied (a 4.5 MB p5.js would otherwise eat the Worker's CPU allowance). GitHub's
   answer must match the id the browser worked out, so a garbled upload is refused. */
export async function uploadBlob(request, env, url) {
  const sha = url.searchParams.get('sha') || '';
  if (!SHA.test(sha)) throw bad('files', 'That file id looks wrong.');
  const max = Math.ceil(LIMITS.totalBytes / 3) * 4;
  if (Number(request.headers.get('content-length') || 0) > max) throw bad('files', 'One file can be up to 25 MB.');
  const data = await request.arrayBuffer();
  if (data.byteLength > max) throw bad('files', 'One file can be up to 25 MB.');
  const bytes = new Uint8Array(data);
  if (!bytes.length || bytes.includes(34) || bytes.includes(92)) throw bad('files', "A file didn't upload properly. Try again.");
  const body = new Blob(['{"encoding":"base64","content":"', bytes, '"}'], { type: 'application/json' });
  const blob = await gh(env, '/git/blobs', { access: 'write', method: 'POST', body });
  if (blob.sha !== sha) throw bad('files', "A file didn't upload properly. Try again.");
  return { sha };
}

/* ---------- 3. save the set ---------- */
export function validateBatch(body) {
  if (!body || typeof body !== 'object') throw bad('', 'Nothing was sent.');
  const course = str(body.course);
  if (!SLUG.test(course)) throw bad('course', 'Pick a course.');
  let assignment = null;
  const a = body.assignment || {};
  if (a.id !== undefined) {
    const id = str(a.id);
    if (id && !SLUG.test(id)) throw bad('assignment', "That assignment name isn't valid.");
    assignment = id ? { id, isNew: false } : null;
  } else if (a.title !== undefined) {
    const title = str(a.title), id = slugify(title, 40);
    if (!id || title.length > 60) throw bad('assignment', 'Give the new assignment a name (under 60 characters).');
    assignment = { id, isNew: true, title, blurb: str(a.blurb).slice(0, 300) };
  }
  const rows = Array.isArray(body.projects) ? body.projects : [];
  if (!rows.length) throw bad('projects', 'Add at least one sketch.');
  if (rows.length > BATCH.projects) throw bad('projects', `That's ${rows.length} sketches; publish up to ${BATCH.projects} at a time.`);

  let entries = 0, inline = 0;
  const projects = rows.map((r, i) => {
    let meta;
    try {
      meta = validateMeta({ ...r, year: body.year, semester: body.semester, instructions: body.instructions, links: [], consent: body.consent });
    } catch (e) {
      if (e instanceof HttpError) { e.extra.row = i; e.message = `Row ${i + 1}: ${e.message}`; }
      throw e;
    }
    const files = [], seen = new Set();
    for (const f of Array.isArray(r.files) ? r.files : []) {
      const path = str(f && f.path).replace(/\\/g, '/').replace(/^\.?\//, ''), sha = str(f && f.sha);
      if (!path || JUNK.test(path) || seen.has(path.toLowerCase())) continue;
      const parts = path.split('/');
      if (parts.length > 6 || parts.some(p => !p || p === '.' || p === '..' || p.startsWith('.') || !SEGMENT.test(p))) {
        throw bad('files', `Row ${i + 1}: "${path}" has characters a file name can't use here. Rename it and try again.`, { row: i });
      }
      seen.add(path.toLowerCase());
      // A small text file comes along as text; anything else was uploaded first and comes by id.
      if (typeof f.content === 'string') {
        inline += f.content.length;
        files.push({ path, content: f.content });
      } else if (SHA.test(sha)) {
        files.push({ path, sha });
      } else {
        throw bad('files', `Row ${i + 1}: a file didn't upload properly.`, { row: i });
      }
    }
    if (!files.some(f => f.path === 'index.html')) throw bad('files', `Row ${i + 1}: the sketch needs an index.html.`, { row: i });
    if (files.length > LIMITS.files) throw bad('files', `Row ${i + 1}: too many files.`, { row: i });
    entries += files.length + 1;
    return { meta, files };
  });
  if (entries > BATCH.entries || inline > BATCH.inline) throw bad('projects', 'That set is too big for one save. Publish it in two halves.');
  return { course, assignment, projects };
}

export async function createBatch(request, env, user) {
  const v = validateBatch(await request.json().catch(() => null));
  const head = (await gh(env, `/git/ref/heads/${encodeURIComponent(env.GITHUB_BRANCH)}`, { access: 'write' })).object.sha;
  const courseList = await listDir(env, v.course, head);
  if (!courseList) throw bad('course', "That course doesn't have a folder in the repo.");
  let assignment = v.assignment;
  if (assignment && assignment.isNew && courseList.includes(assignment.id)) assignment = { ...assignment, isNew: false };
  const dir = assignment ? `${v.course}/${assignment.id}` : v.course;
  const taken = new Set(!assignment ? courseList : assignment.isNew ? [] : (await listDir(env, dir, head)) || []);

  const entries = [], saved = [];
  for (const p of v.projects) {
    const base = folderName({ students: p.meta.students, assignment: assignment && assignment.id, ...p.meta });
    let folder = base, n = 2;
    while (taken.has(folder)) folder = `${base}-${n++}`;
    taken.add(folder);
    const path = `${dir}/${folder}`;
    for (const f of p.files) {
      entries.push({ path: `${path}/${f.path}`, mode: '100644', type: 'blob', ...(f.content !== undefined ? { content: f.content } : { sha: f.sha }) });
    }
    entries.push({ path: `${path}/project.yml`, mode: '100644', type: 'blob', content: projectYaml({ meta: p.meta, kind: 'sketch' }, []) });
    saved.push({ path, folder, title: p.meta.title, show: p.meta.show });
  }
  if (assignment && assignment.isNew) {
    entries.push({ path: `${dir}/assignment.yml`, mode: '100644', type: 'blob', content: assignmentYaml(assignment) });
  }

  const shown = saved.filter(s => s.show).length;
  const where = [v.course, assignment && assignment.id].filter(Boolean).join(' / ');
  const message = [
    `Add ${saved.length} project${saved.length === 1 ? '' : 's'} (${where})`,
    saved.map(s => `- ${s.title} (${s.show ? 'shown' : 'hidden'})`).join('\n'),
    `Added with the CS teacher dashboard by ${user.name} <${user.email}>.` +
      (shown ? ` The teacher confirmed the students of the ${shown} shown project${shown === 1 ? '' : 's'} agreed.` : '')
  ].join('\n\n');
  let commit;
  try {
    commit = await saveCommit(env, { parent: head, entries, message, user });
  } catch (e) {
    if (e.githubStatus === 422) throw bad('files', 'Some files never reached the repo. Publish again; it only re-sends what\'s missing.');
    throw e;
  }
  return { commit: commit.sha, branch: env.GITHUB_BRANCH, published: env.GITHUB_BRANCH === 'main', projects: saved, dir };
}
