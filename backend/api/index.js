const app = require("../src/actions/triggerWorkflowRun");

module.exports = (req, res) => {
  if (req.url === "/api" || req.url.startsWith("/api?")) {
    req.url = req.url.replace(/^\/api/, "") || "/";
  }

  return app(req, res);
};