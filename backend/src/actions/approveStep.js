require("dotenv").config();

const express = require("express");
const {
  GraphQLClient,
  gql,
} = require("graphql-request");

const {
  resumeWorkflowRun,
} = require("../workflowEngine");

const app = express();

app.use(express.json());

const HASURA_GRAPHQL_URL =
  process.env.HASURA_GRAPHQL_URL;

const HASURA_ADMIN_SECRET =
  process.env.HASURA_ADMIN_SECRET;

const hasura =
  new GraphQLClient(
    HASURA_GRAPHQL_URL,
    {
      headers: {
        "x-hasura-admin-secret":
          HASURA_ADMIN_SECRET,
      },
    }
  );

const GET_STEP_RUN = gql`
  query GetStepRun($id: uuid!) {
    step_runs_by_pk(id: $id) {
      id
      status
      workflow_run_id
      workflow_step_id

      workflow_run {
        id
        status
        workflow_id
      }

      workflow_step {
        id
        type
      }
    }
  }
`;

const GET_MEMBERSHIP = gql`
  query GetMembership(
    $orgId: uuid!
    $userId: uuid!
  ) {
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

const GET_WORKFLOW_ORG = gql`
  query GetWorkflowOrg(
    $workflowId: uuid!
  ) {
    workflows_by_pk(id: $workflowId) {
      id
      org_id
    }
  }
`;

const APPROVE_STEP = gql`
  mutation ApproveStep(
    $id: uuid!
    $userId: uuid!
    $approvedAt: timestamptz!
  ) {
    update_step_runs_by_pk(
      pk_columns: { id: $id }
      _set: {
        status: "approved"
        approved_by: $userId
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
      sessionVariables[
        "x-hasura-user-id"
      ];

    const stepRunId =
      req.body.input?.step_run_id ||
      req.body.step_run_id;

    if (!userId) {
      return res.status(401).json({
        message:
          "Unauthenticated",
      });
    }

    if (!stepRunId) {
      return res.status(400).json({
        message:
          "step_run_id is required",
      });
    }

    const stepResult =
      await hasura.request(
        GET_STEP_RUN,
        {
          id: stepRunId,
        }
      );

    const stepRun =
      stepResult.step_runs_by_pk;

    if (!stepRun) {
      return res.status(404).json({
        message:
          "Step run not found",
      });
    }

    if (
      stepRun.workflow_step
        ?.type !==
      "approval_gate"
    ) {
      return res.status(400).json({
        message:
          "Requested step is not an approval gate",
      });
    }

    if (
      stepRun.status !==
      "paused"
    ) {
      return res.status(400).json({
        message:
          "RUN_NOT_PAUSED",
      });
    }

    if (
      stepRun.workflow_run
        ?.status !==
      "paused"
    ) {
      return res.status(400).json({
        message:
          "Workflow run is not paused",
      });
    }

    const workflowId =
      stepRun.workflow_run
        .workflow_id;

    const workflowResult =
      await hasura.request(
        GET_WORKFLOW_ORG,
        {
          workflowId,
        }
      );

    const workflow =
      workflowResult
        .workflows_by_pk;

    if (!workflow) {
      return res.status(404).json({
        message:
          "Workflow not found",
      });
    }

    const membershipResult =
      await hasura.request(
        GET_MEMBERSHIP,
        {
          orgId:
            workflow.org_id,
          userId,
        }
      );

    const membership =
      membershipResult
        .org_members[0];

    if (!membership) {
      return res.status(403).json({
        message:
          "APPROVAL_NOT_AUTHORIZED",
      });
    }

    if (
      !["owner", "editor"].includes(
        membership.role
      )
    ) {
      return res.status(403).json({
        message:
          "APPROVAL_NOT_AUTHORIZED",
      });
    }

    const approvalResult =
      await hasura.request(
        APPROVE_STEP,
        {
          id: stepRunId,
          userId,
          approvedAt:
            new Date().toISOString(),
        }
      );

    const approved =
      approvalResult
        .update_step_runs_by_pk;

    const execution =
      await resumeWorkflowRun(
        hasura,
        stepRun.workflow_run_id,
        workflowId,
        stepRun.workflow_step_id
      );

    return res.json({
      step_run_id:
        approved.id,
      status:
        approved.status,
      approved_by:
        approved.approved_by,
      approved_at:
        approved.approved_at,
      workflow_run_status:
        execution.status,
    });
  } catch (error) {
    console.error(
      "approveStep error:",
      error
    );

    return res.status(500).json({
      message:
        error.message ||
        "Approval failed",
    });
  }
});

module.exports = app;