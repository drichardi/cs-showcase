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
  "skills": ["python", "data"],    // keys from the "skills" dictionary
  "quote": { "text": "…", "by": "Student ’26", "placeholder": true, "show": false }
}
```

Student quotes can be switched off: one course's with `"show": false` in its `quote`, or
every course's with `"showQuotes": false` in `meta`. The course editor (`editor.html`)
has a checkbox for each.

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

Its caption has **Show another**, which picks a different project at random. There is
no heading: the work speaks for itself.

Under it are rows of projects by course, picked at random on each visit. `ROW_SIZE` and `ROW_MIN` in `assets/js/config.js` set the rules:

- a course with at least `ROW_MIN` (4) projects gets its own row of up to `ROW_SIZE` (5)
- courses with fewer share rows, packed in course order and never split across two
  rows, with each card labelled with its course
- a course with no published projects gets no row

Clicking any card plays it in the large view. On phones each row is a strip you swipe.

The nav: **Home**; **Courses**, a menu of every course page (from `data/courses.json`);
and **Course planning**, a menu with "View course map" (the intro and the map) and
"Create your plan" (the planner and FAQ), which swap the home page out. Home and the
site name bring it back. Teachers who've signed in to the dashboard in that browser also
get a **Public site | Dashboard** switch.

The three designs (skins A, B, C) all stay in the CSS, but the picker is hidden and
everyone sees Survey (B). `?skin=a` (or `c`) in a URL previews another; to bring the
picker back for feedback, set `SHOW_DESIGN_PICKER` in `assets/js/shared.js` to `true`.

The URL hash picks the view (`#map`, `#plan`; none for the home page), so links from course
pages, shared routes (`#route=…`), tag filters (`#tag=…`) and the back button all land
on the right one. Switching away stops a running sketch or game.

## Previewing a local copy of the work repo

When this site runs on localhost, `index.html?work=http://localhost:8125/` reads
student work from a local server instead of GitHub Pages (remembered for that browser
tab). The server must send `Access-Control-Allow-Origin: *`, as GitHub Pages does. The
live site ignores the parameter.

## Teacher dashboard

`/admin/` (https://drichardi.github.io/cs-showcase/admin/) is where CS teachers manage the
student work without touching GitHub. The one-page **teacher guide** for using it is
`/admin/guide.html`, linked from the dashboard. Sign in with a Punahou Google account on
the teacher list; then:

- **Projects:** every project in `cs-student-work`, shown or hidden, with covers, search,
  and filters by course, assignment and status. "Needs attention" finds the ones with
  something to fix; "Could add" on a card is only a suggestion.
- **Add project:** pick the course, assignment (or start a new one) and term; drop in the
  p5 editor's zip or a sketch folder, paste a p5 editor / Scratch / CodePen / itch.io link,
  or add pictures; see it running in a preview; fill in title, students, description and
  "Try it" steps; under "On the site", choose whether visitors can play it here, where
  "View code" goes (automatic, another address, or none) and an optional "See it in
  action" link; choose a cover; tick "Show it on the site" (which needs the consent box).
  Publishing saves it to the repo as one change under the teacher's name and shows when
  it's live, about a minute later.
- **Add several:** a class set at once. Pick the course, assignment and term, then drop in
  the students' zips or a folder of them (a Google Classroom or Drive download works,
  zips inside zips included). Every sketch found becomes a row with its title and
  students guessed from the file names, a preview, and a Show box; one consent box covers
  the ones marked Show. Files the repo already has, like p5.js, aren't uploaded again.
- **Edit:** every card has Edit (Set up for a sketch folder with no `project.yml`, Fix for
  one with a mistake) and Show on site / Hide. Editing changes the details, the cover, or
  the files (upload a new version of the sketch); anything else in `project.yml` is kept.
  If a colleague changed the same project in the meantime, the save stops and says so.
- **Assignments:** "New assignment" sets one up before any work is added (it shows on
  the site once it has shown work). Filter to one assignment to see and edit its name,
  description and order.

A sign-in lasts 8 hours. If it runs out with the dashboard open, a "Sign in again" box
covers the page instead of signing out, so a half-filled form isn't lost. Leaving a page
with unsaved changes (or closing the tab) asks first.

The dashboard's server program is in `admin-api/` (a Cloudflare Worker; its README has
the setup, the secrets and how to test).
