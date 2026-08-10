const app = require("../src/actions/approveStep");

module.exports = (req, res) => {
  // Vercel invokes this function at /api/approveStep,
  // while the Express app defines POST "/".
  if (
    req.url === "/api/approveStep" ||
    req.url.startsWith("/api/approveStep?")
  ) {
    req.url =
      req.url.replace(/^\/api\/approveStep/, "") || "/";
  }

  return app(req, res);
};