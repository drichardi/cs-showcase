/* ============================================================
   The only file you should ever need to edit for plumbing.
   Course content lives in data/courses.json.
   ============================================================ */
window.CS_CONFIG = {

  // Where the student-work repo is published.
  // GitHub Pages on the work repo:  https://<org-or-user>.github.io/<work-repo>/
  // Must end with a slash.
  WORK_BASE: "https://drichardi.github.io/cs-student-work/",

  // The same repo on GitHub, for "View code" links on sketches hosted in it.
  WORK_REPO: "https://github.com/drichardi/cs-student-work",

  // Name of the generated index inside that repo. Built by the GitHub Action.
  WORK_MANIFEST: "manifest.json",

  // Home page rows, under the featured project. Each course with at least
  // ROW_MIN projects gets its own row of up to ROW_SIZE, picked at random.
  // Courses with fewer share rows, each card labelled with its course.
  // Courses with none get no row.
  ROW_SIZE: 5,
  ROW_MIN: 4
};
