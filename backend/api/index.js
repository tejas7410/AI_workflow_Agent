const triggerWorkflowRun = require("../src/actions/triggerWorkflowRun");
const approveStep = require("../src/actions/approveStep");

module.exports = (req, res) => {
  const path = req.url.split("?")[0];

  // Hasura Action: /api/approveStep
  if (path === "/api/approveStep" || path === "/approveStep") {
    req.url = "/";
    return approveStep(req, res);
  }

  // Hasura Action: /api
  if (path === "/api" || path === "/") {
    req.url = "/";
    return triggerWorkflowRun(req, res);
  }

  // Unknown route
  return res.status(404).json({
    message: "Not found",
  });
};