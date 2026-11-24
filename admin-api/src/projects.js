/* Reading the student-work repo for the dashboard: every project, shown or hidden,
   found by the same rules as the repo's scripts/build_manifest.py.

   Three GitHub calls however big the repo gets: the branch, its whole file tree,
   then the project.yml / assignment.yml texts in batches of 100 through GraphQL.
   (Cloudflare's free plan allows 50 outgoing calls per request.) */
import { parse } from 'yaml';
import { gh, graphql, repoParts } from './github.js';
import { HttpError } from './http.js';

const SKIP = new Set(['.git', '.github', 'scripts', 'node_modules', '_site']);
const META = ['project.yml', 'project.yaml', 'project.json'];
const MEDIA = /\.(png|jpe?g|webp|gif|svg|avif|mp4|webm|mov)$/i;
const MAX_DEPTH = 3;                // like the builder: projects up to four folders below the course

export async function listProjects(env) {
  const ref = await gh(env, `/git/ref/heads/${encodeURIComponent(env.GITHUB_BRANCH)}`);
  const tree = await gh(env, `/git/trees/${ref.object.sha}?recursive=1`);
  if (tree.truncated) console.warn('Repo tree truncated: some projects may be missing');
  const found = discover(tree.tree);
  const texts = await blobTexts(env, [...found.shas]);
  return { commit: ref.object.sha, branch: env.GITHUB_BRANCH, ...assemble(found, texts) };
}

/* Which folders are projects, from the repo's file list alone.
   entries: GitHub tree entries [{ path, type: 'blob'|'tree', sha }]. */
export function discover(entries) {
  const files = new Map(), dirs = new Map();      // folder -> its files / its sub-folders
  const add = (map, key, value) => (map.get(key) || map.set(key, []).get(key)).push(value);
  for (const e of entries) {
    const cut = e.path.lastIndexOf('/');
    const parent = cut < 0 ? '' : e.path.slice(0, cut), name = e.path.slice(cut + 1);
    if (e.type === 'tree') add(dirs, parent, e.path);
    else if (e.type === 'blob') add(files, parent, { name, sha: e.sha });
  }
  const names = dir => (files.get(dir) || []).map(f => f.name);
  const projects = [], loose = [], shas = new Set(), assignmentYml = new Map();
  const folders = [];                 // assignment folders (with assignment.yml), even empty ones
  const allFiles = new Set(entries.filter(e => e.type === 'blob').map(e => e.path));

  function walk(dir, course, depth) {
    for (const sub of (dirs.get(dir) || []).slice().sort()) {
      const leaf = sub.slice(sub.lastIndexOf('/') + 1);
      if (leaf.startsWith('.') || SKIP.has(leaf)) continue;
      const here = files.get(sub) || [];
      const yml = depth === 0 && here.find(f => f.name === 'assignment.yml');
      if (yml) { folders.push({ course, id: leaf }); assignmentYml.set(sub, yml.sha); shas.add(yml.sha); }
      const meta = META.map(m => here.find(f => f.name === m)).find(Boolean);
      if (meta) {
        projects.push({ path: sub, course, meta: meta.name, sha: meta.sha, files: names(sub) });
        shas.add(meta.sha);
      } else if (here.some(f => f.name === 'index.html')) {
        loose.push({ path: sub, course, files: names(sub) });       // a sketch with no project.yml yet
      } else if (depth < MAX_DEPTH) {
        walk(sub, course, depth + 1);
      }
    }
  }
  for (const course of (dirs.get('') || []).slice().sort()) {
    if (course.startsWith('.') || SKIP.has(course)) continue;
    walk(course, course, 0);
  }
  // assignment.yml in each assignment folder that holds projects
  for (const p of [...projects, ...loose]) {
    const a = assignmentOf(p.path);
    const yml = a && (files.get(`${p.course}/${a}`) || []).find(f => f.name === 'assignment.yml');
    if (yml) { assignmentYml.set(`${p.course}/${a}`, yml.sha); shas.add(yml.sha); }
  }
  return { projects, loose, shas, assignmentYml, allFiles, folders };
}

/* Turn the found folders and their yml texts into what the dashboard shows. */
export function assemble(found, texts) {
  const out = [];
  for (const p of found.projects) {
    let meta = {}, problem = '';
    try {
      const raw = texts.get(p.sha) ?? '';
      meta = (p.meta.endsWith('.json') ? JSON.parse(raw) : parse(raw)) ?? {};
      if (typeof meta !== 'object' || Array.isArray(meta)) throw new Error('it should be a list of fields');
    } catch (e) {
      problem = `${p.meta} has a mistake: ${String(e.message).split('\n')[0]}`;
      meta = {};
    }
    const sketch = p.files.includes('index.html');
    const embed = sketch || (Array.isArray(meta.media) && meta.media.some(m => m && m.type === 'embed'));
    const { cover, missing } = coverOf(p, meta, found.allFiles);
    // issues: things to fix ("Needs attention"). tips: nice to add, never required.
    // A sketch hosted here needs no cover: one is made when it goes on the site.
    const issues = [], tips = [];
    if (problem) issues.push(problem);
    if (!text(meta.title)) issues.push('No title');
    if (!text(meta.student)) issues.push('No student names');
    if (missing.length) issues.push(`Listed but missing: ${missing.join(', ')}`);
    if (!cover && !sketch) issues.push('No cover');
    if ('consent' in meta || 'draft' in meta) issues.push('Old consent/draft fields: open Edit and save to tidy');
    if (!text(meta.blurb)) tips.push('a description');
    if (embed && !hasInstructions(meta.instructions)) tips.push('"Try it" steps');
    out.push({
      ...basics(p),
      status: problem ? 'broken' : meta.show === true ? 'shown' : 'hidden',
      title: text(meta.title) || titleFrom(leafOf(p.path)),
      student: text(meta.student), year: meta.year ?? null, semester: text(meta.semester),
      blurb: text(meta.blurb), instructions: meta.instructions ?? '', links: Array.isArray(meta.links) ? meta.links : [],
      cover, sketch, embed, issues, tips
    });
  }
  for (const p of found.loose) {
    out.push({
      ...basics(p), status: 'not-set-up', title: titleFrom(leafOf(p.path)),
      student: '', year: null, semester: '', blurb: '', instructions: '', links: [],
      cover: coverOf(p, {}, found.allFiles).cover, sketch: true, embed: true, issues: ['No details yet: press Set up'], tips: []
    });
  }
  out.sort((a, b) => a.path.localeCompare(b.path));

  // Each course's assignments, named like the site names them: those with projects,
  // and new ones that have only their assignment.yml so far (count 0).
  const assignments = {};
  const named = (course, id) => {
    const list = assignments[course] || (assignments[course] = []);
    let a = list.find(x => x.id === id);
    if (!a) {
      let info = {};
      const sha = found.assignmentYml.get(`${course}/${id}`);
      try { info = (sha && parse(texts.get(sha) ?? '')) || {}; } catch (e) { info = {}; }
      a = { id, title: text(info.title) || titleFrom(id), blurb: text(info.blurb), order: info.order ?? null, ymlSha: sha || null, count: 0 };
      list.push(a);
    }
    return a;
  };
  for (const p of out) if (p.assignment) named(p.course, p.assignment).count++;
  for (const f of found.folders || []) named(f.course, f.id);
  return { projects: out, assignments };
}

/* The cover for the dashboard thumbnail (a path in the repo, or a URL), and any
   pictures project.yml lists that aren't actually in the folder. */
function coverOf(p, meta, allFiles) {
  const missing = [];
  let cover = '';
  if (Array.isArray(meta.media)) {
    for (const m of meta.media) {
      const src = typeof m === 'string' ? m : m && m.type !== 'embed' ? m.src : '';
      if (!src || !MEDIA.test(src)) continue;
      if (/^https?:\/\//i.test(src)) { cover = cover || src; continue; }
      if (allFiles.has(`${p.path}/${src}`)) cover = cover || `${p.path}/${src}`;
      else missing.push(src);
    }
  }
  if (!cover) {
    const own = p.files.slice().sort().find(f => /^cover\./i.test(f) && MEDIA.test(f));
    if (own) cover = `${p.path}/${own}`;
  }
  return { cover, missing };
}

/* One file from the repo (covers and other pictures only), for thumbnails: the repo
   is private, so the browser can't load them from GitHub itself. */
export async function readFile(env, path) {
  if (!path || !/^[\w\-./ ]+$/.test(path) || path.split('/').includes('..') || !MEDIA.test(path)) {
    throw new HttpError(400, 'bad_path', 'Only pictures and videos from the repo can be fetched.');
  }
  let res;
  try {
    res = await gh(env, `/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(env.GITHUB_BRANCH)}`,
      { accept: 'application/vnd.github.raw', raw: true });
  } catch (e) {
    if (e.githubStatus === 404) throw new HttpError(404, 'not_found', "That file isn't in the repo.");
    throw e;
  }
  return new Response(res.body, { headers: { 'Content-Type': mimeOf(path), 'Cache-Control': 'private, max-age=300' } });
}

async function blobTexts(env, shas) {
  const { owner, name } = repoParts(env);
  const texts = new Map();
  for (let i = 0; i < shas.length; i += 100) {
    const chunk = shas.slice(i, i + 100);
    const fields = chunk.map((sha, j) => `b${j}: object(oid: "${sha}") { ... on Blob { text } }`).join('\n');
    const data = await graphql(env, `query($owner: String!, $name: String!) {
      repository(owner: $owner, name: $name) { ${fields} } }`, { owner, name });
    chunk.forEach((sha, j) => texts.set(sha, data.repository[`b${j}`]?.text ?? ''));
  }
  return texts;
}

/* ---------- small helpers, matching build_manifest.py ---------- */
function basics(p) {
  return { path: p.path, course: p.course, assignment: assignmentOf(p.path), id: leafOf(p.path) };
}
export function assignmentOf(path) {
  const parts = path.split('/');
  return parts.length > 2 ? parts[1] : '';
}
const leafOf = path => path.slice(path.lastIndexOf('/') + 1);
const text = v => (v == null ? '' : String(v).trim());
const titleFrom = s => s.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
function hasInstructions(v) {
  return Array.isArray(v) ? v.some(x => text(x)) : !!text(v);
}
function mimeOf(path) {
  const ext = path.slice(path.lastIndexOf('.') + 1).toLowerCase();
  return { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif',
    svg: 'image/svg+xml', avif: 'image/avif', mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime' }[ext]
    || 'application/octet-stream';
}
