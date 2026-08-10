require("dotenv").config();

const express = require("express");
const { GraphQLClient, gql } = require("graphql-request");

const app = express();

app.use(express.json());

const HASURA_GRAPHQL_URL = process.env.HASURA_GRAPHQL_URL;
const HASURA_ADMIN_SECRET = process.env.HASURA_ADMIN_SECRET;

if (!HASURA_GRAPHQL_URL || !HASURA_ADMIN_SECRET) {
  console.error("Missing Hasura environment variables");
  process.exit(1);
}

const hasura = new GraphQLClient(HASURA_GRAPHQL_URL, {
  headers: {
    "x-hasura-admin-secret": HASURA_ADMIN_SECRET,
  },
});

const GET_STEP_RUN = gql`
  query GetStepRun($stepRunId: uuid!) {
    step_runs_by_pk(id: $stepRunId) {
      id
      status
      workflow_run_id
      workflow_step_id
      workflow_step {
        id
        type
        workflow_id
        workflow {
          id
          org_id
        }
      }
    }
  }
`;

const GET_MEMBERSHIP = gql`
  query GetMembership($orgId: uuid!, $userId: uuid!) {
    org_members(
      where: {
        org_id: { _eq: $orgId }
        user_id: { _eq: $userId }
      }
      limit: 1
    ) {
      id
      role
    }
  }
`;

const APPROVE_STEP = gql`
  mutation ApproveStep(
    $id: uuid!
    $approvedBy: uuid!
    $approvedAt: timestamptz!
  ) {
    update_step_runs_by_pk(
      pk_columns: { id: $id }
      _set: {
        status: "approved"
        approved_by: $approvedBy
        approved_at: $approvedAt
      }
    ) {
      id
      status
      approved_by
      approved_at
    }
  }
`;

app.post("/", async (req, res) => {
  try {
    const sessionVariables =
      req.body.session_variables || {};

    const userId =
      sessionVariables["x-hasura-user-id"];

    const stepRunId =
      req.body.input?.step_run_id;

    // Authentication
    if (!userId) {
      return res.status(401).json({
        message: "Unauthenticated",
      });
    }

    // Input validation
    if (!stepRunId) {
      return res.status(400).json({
        message: "step_run_id is required",
      });
    }

    // Load step run
    const stepResult =
      await hasura.request(GET_STEP_RUN, {
        stepRunId,
      });

    const stepRun =
      stepResult.step_runs_by_pk;

    if (!stepRun) {
      return res.status(404).json({
        message: "Step run not found",
      });
    }

    // Must currently be paused
    if (stepRun.status !== "paused") {
      return res.status(400).json({
        message:
          "Step run is not waiting for approval",
      });
    }

    // Must be an approval gate
    if (
      stepRun.workflow_step.type !==
      "approval_gate"
    ) {
      return res.status(400).json({
        message:
          "Step run is not an approval gate",
      });
    }

    // Resolve organization
    const orgId =
      stepRun.workflow_step.workflow.org_id;

    // Check organization membership
    const membershipResult =
      await hasura.request(GET_MEMBERSHIP, {
        orgId,
        userId,
      });

    const membership =
      membershipResult.org_members[0];

    if (!membership) {
      return res.status(403).json({
        message:
          "Not a member of this organization",
      });
    }

    // Only owner/editor can approve
    if (
      !["owner", "editor"].includes(
        membership.role
      )
    ) {
      return res.status(403).json({
        message: "Insufficient role",
      });
    }

    // Approve
    const approvedAt =
      new Date().toISOString();

    const result =
      await hasura.request(APPROVE_STEP, {
        id: stepRunId,
        approvedBy: userId,
        approvedAt,
      });

    const approvedStep =
      result.update_step_runs_by_pk;

    return res.json({
      step_run_id: approvedStep.id,
      status: approvedStep.status,
      approved_by:
        approvedStep.approved_by,
      approved_at:
        approvedStep.approved_at,
    });
  } catch (error) {
    console.error(
      "approveStep error:",
      error
    );

    return res.status(500).json({
      message:
        error.message ||
        "Failed to approve step",
    });
  }
});

module.exports = app;