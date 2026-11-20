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

  // Shown while the real repo is empty or unreachable.
  FALLBACK_MANIFEST: "data/sample-work.json",

  // How many projects to show in the gallery on the home page.
  GALLERY_COUNT: 6
};
