/* Dashboard settings. Nothing here is secret. */
window.ADMIN_CONFIG = {
  // "Sign in with Google" app, from the school's Google Cloud project.
  GOOGLE_CLIENT_ID: "995828673256-6jslv71v52kdb45o05r8dahggq7jsiu2.apps.googleusercontent.com",
  SCHOOL_DOMAIN: "punahou.edu",

  // The dashboard's server program (admin-api/, on Cloudflare Workers).
  API_BASE: "https://cs-work-api.cs-work-api.workers.dev",

  // Used instead whenever this page itself runs on localhost (node admin-api/dev.mjs).
  LOCAL_API_BASE: "http://localhost:8787"
};
