const app = require("../src/actions/approveStep");

module.exports = (req, res) => {
  if (
    req.url === "/api/approveStep" ||
    req.url.startsWith("/api/approveStep?")
  ) {
    req.url =
      req.url.replace(
        /^\/api\/approveStep/,
        ""
      ) || "/";
  }

  return app(req, res);
};