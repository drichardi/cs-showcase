# CS Course Showcase

Static site — no build step, no dependencies, no framework. Push to GitHub Pages and it runs.

```
index.html
data/courses.json        ← all course content lives here
data/sample-work.json    ← placeholder work, shown until the work repo is live
assets/js/config.js      ← the one plumbing file: where the work repo lives
assets/js/…              topo backdrop, map, planner, work loader, stage, boot
assets/css/style.css
assets/sample/           placeholder thumbnails and a sample p5 sketch (delete once real work exists)
```

## Setup

1. Push this repo, then turn on Pages (Settings → Pages → deploy from `main`, root).
2. Set up the companion `cs-student-work` repo and turn on Pages there too, with the source set to
   **GitHub Actions** (Settings → Pages → Build and deployment → Source), not "deploy from a branch".
   Its workflow builds `manifest.json` and deploys it, and fails at the Pages step until this is set.
3. Edit **one line** in `assets/js/config.js`:

```js
WORK_BASE: "https://YOUR-ORG.github.io/cs-student-work/",
```

Until that URL resolves, and while the work repo has no projects in it yet, the site
quietly falls back to `data/sample-work.json` and shows a small note under the gallery.
Nothing breaks. Once the first real project is published, the samples disappear.

## Changing course content

Everything a student reads comes from `data/courses.json`. Add a course, rename one,
change a prerequisite, retag a skill — no JavaScript involved.

A course entry:

```jsonc
{
  "slug": "data-science-ml",       // must match the work-repo folder name
  "name": "Data Science and Machine Learning",
  "short": "Data Sci & ML",        // used in prereq messages
  "line": "tier2",                 // which coloured line it sits on
  "semesters": 1,                  // 2 = full year, occupies both slots of a grade
  "countsAsProgramming": true,     // feeds the capstone's two-semester rule
  "tagline": "…",                  // one line, shown on the map
  "about": "…",                    // paragraph, shown in the drawer
  "highlights": ["…"],             // bullets, shown in the drawer
  "prereqText": "Intro to Programming or AP CSP, and Algebra II",
  "prereqs": [{ "anyOf": ["intro-programming", "ap-csp"] }],
  "note": "…",                     // optional callout
  "skills": ["python", "data"]     // keys from the "skills" dictionary
}
```

Three prerequisite forms are supported:

| Form | Meaning |
|---|---|
| `{ "anyOf": [...] }` | at least one of these, completed earlier |
| `{ "allOf": [...] }` | all of these, completed earlier |
| `{ "programmingSemesters": 2 }` | two semesters of anything with `countsAsProgramming` |

The planner enforces all three and explains the failure in plain words when a course
is greyed out.

## Skills

The `skills` dictionary is what powers the "this route never touches…" readout, which
is the most useful thing on the page for a student who thinks they've planned enough.
Adding a skill key automatically adds it to that gap list — keep the vocabulary tight
so the gaps stay meaningful.

## Shareable routes

A built route is encoded into the URL hash, so a student can send their plan to a
counselor or parent with no account and no backend.

## Student work comes first

Each course page opens with one of that course's projects shown large, chosen at
random, with every other project from the course in a grid underneath. Clicking a
card loads it into the large view. A playable project (a p5 sketch, an itch.io game)
runs right there, scaled up to fill the space; sketches with a fixed canvas keep the
mouse lined up at any scale. `course.html?c=intro-programming#p=<folder-name>` opens
a specific project first, so a student can share a link to their own work.

The home page does the same with one project per course, right under the hero.
How to add sketches and size them is in the work repo's README.
