# CS Course Showcase

Static site — no build step, no dependencies, no framework. Push to GitHub Pages and it runs.

```
index.html
data/courses.json        ← all course content lives here
assets/js/config.js      ← the one plumbing file: where the work repo lives
assets/js/…              topo backdrop, map, planner, work loader, stage, boot
assets/css/style.css
```

Student work comes only from the companion `cs-student-work` repo. There is no
placeholder work: a course with nothing published shows nothing.

## Setup

1. Push this repo, then turn on Pages (Settings → Pages → deploy from `main`, root).
2. Set up the companion `cs-student-work` repo and turn on Pages there too, with the source set to
   **GitHub Actions** (Settings → Pages → Build and deployment → Source), not "deploy from a branch".
   Its workflow builds `manifest.json` and deploys it, and fails at the Pages step until this is set.
3. Edit **one line** in `assets/js/config.js`:

```js
WORK_BASE: "https://YOUR-ORG.github.io/cs-student-work/",
```

If the work repo can't be reached, the pages say student work couldn't be loaded;
everything else still works.

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
random, with every other project from the course in a grid underneath. On wide screens
the caption sits to the right of the project: title, students, term, blurb, and a
"Try it" box when the project's `project.yml` has `instructions`. Clicking a card loads
it into the large view.

Under the project, a chip for each assignment (the folder projects sit in, e.g.
`intro-programming/tiling/`) filters to that assignment, and "All" shows a row per
assignment, picked at random by the same `ROW_SIZE` / `ROW_MIN` rule as the home page:
small assignments share a row, with each card labelled. `#a=tiling` links straight to an
assignment, and `#a=tiling&p=<project>` to one project in it. Titles and descriptions
come from an optional `assignment.yml` in the work repo (see its README).

"View code" opens the sketch's own code file as published with it, so it works with
the work repo private. A playable project (a p5 sketch, an itch.io game)
runs right there, scaled up to fill the space; sketches with a fixed canvas keep the
mouse lined up at any scale. `course.html?c=intro-programming#p=<folder-name>` opens
a specific project first, so a student can share a link to their own work.

## The home page

The home page **is** the student work page. One project is shown large, chosen at
random (a playable one when there is one). On screens at least 1000×560 it fits the
window, with its caption to the right and the start of the rows peeking in below.

Under it are rows of projects by course, picked at random on each visit (Shuffle picks
again). `ROW_SIZE` and `ROW_MIN` in `assets/js/config.js` set the rules:

- a course with at least `ROW_MIN` (4) projects gets its own row of up to `ROW_SIZE` (5)
- courses with fewer share rows, packed in course order and never split across two
  rows, with each card labelled with its course
- a course with no published projects gets no row

Clicking any card plays it in the large view. On phones each row is a strip you swipe.

**Courses** (the intro and the map) and **Plan a route** (the planner and FAQ) are
links in the nav that swap the home page out; the site name brings it back. The URL
hash picks the view (`#map`, `#plan`; none for the home page), so links from course
pages, shared routes (`#route=…`), tag filters (`#tag=…`) and the back button all land
on the right one. Switching away stops a running sketch or game.

## Previewing a local copy of the work repo

When this site runs on localhost, `index.html?work=http://localhost:8125/` reads
student work from a local server instead of GitHub Pages (remembered for that browser
tab). The server must send `Access-Control-Allow-Origin: *`, as GitHub Pages does. The
live site ignores the parameter.
