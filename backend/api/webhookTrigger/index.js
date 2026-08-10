require("dotenv").config();

const express = require("express");
const { GraphQLClient, gql } = require("graphql-request");

const {
  executeWorkflowRun,
} = require("../../src/workflowEngine");

const app = express();

app.use(express.json());

const HASURA_GRAPHQL_URL =
  process.env.HASURA_GRAPHQL_URL;

const HASURA_ADMIN_SECRET =
  process.env.HASURA_ADMIN_SECRET;

if (
  !HASURA_GRAPHQL_URL ||
  !HASURA_ADMIN_SECRET
) {
  throw new Error(
    "Missing Hasura environment variables"
  );
}

const hasura = new GraphQLClient(
  HASURA_GRAPHQL_URL,
  {
    headers: {
      "x-hasura-admin-secret":
        HASURA_ADMIN_SECRET,
    },
  }
);

const GET_TRIGGER = gql`
  query GetWebhookTrigger(
    $workflowId: uuid!
  ) {
    workflow_triggers(
      where: {
        workflow_id: { _eq: $workflowId }
        type: { _eq: "webhook" }
        enabled: { _eq: true }
      }
      limit: 1
    ) {
      id
      workflow_id
      type
      config
      enabled
    }
  }
`;

const GET_WORKFLOW = gql`
  query GetWorkflow($workflowId: uuid!) {
    workflows_by_pk(id: $workflowId) {
      id
      org_id
      status
    }
  }
`;

const GET_STEPS = gql`
  query GetSteps($workflowId: uuid!) {
    workflow_steps(
      where: {
        workflow_id: { _eq: $workflowId }
      }
      order_by: {
        step_order: asc
      }
    ) {
      id
      step_order
      name
      type
      config
    }
  }
`;

const CREATE_RUN = gql`
  mutation CreateWebhookRun(
    $workflowId: uuid!
    $startedAt: timestamptz!
  ) {
    insert_workflow_runs_one(
      object: {
        workflow_id: $workflowId
        trigger_type: "webhook"
        status: "running"
        started_at: $startedAt
      }
    ) {
      id
      status
    }
  }
`;

const RESERVE_QUOTA = gql`
  mutation ReserveQuota($orgId: uuid!) {
    update_organizations(
      where: {
        id: { _eq: $orgId }
        calls_used: {
          _lt: calls_allowed
        }
      }
      _inc: {
        calls_used: 1
      }
    ) {
      affected_rows
    }
  }
`;

const FAIL_RUN = gql`
  mutation FailRun(
    $id: uuid!
    $error: String!
  ) {
    update_workflow_runs_by_pk(
      pk_columns: { id: $id }
      _set: {
        status: "failed"
        error: $error
      }
    ) {
      id
      status
    }
  }
`;

app.post("/", async (req, res) => {
  let runId = null;

  try {
    const workflowId =
      req.body.workflow_id ||
      req.query.workflow_id;

    const suppliedSecret =
      req.headers[
        "x-workflow-webhook-secret"
      ];

    if (!workflowId) {
      return res.status(400).json({
        message:
          "workflow_id is required",
      });
    }

    const workflowResult =
      await hasura.request(
        GET_WORKFLOW,
        {
          workflowId,
        }
      );

    const workflow =
      workflowResult.workflows_by_pk;

    if (!workflow) {
      return res.status(404).json({
        message:
          "Workflow not found",
      });
    }

    if (workflow.status !== "active") {
      return res.status(400).json({
        message:
          "Workflow is not active",
      });
    }

    const triggerResult =
      await hasura.request(
        GET_TRIGGER,
        {
          workflowId,
        }
      );

    const trigger =
      triggerResult.workflow_triggers[0];

    if (!trigger) {
      return res.status(404).json({
        message:
          "Webhook trigger not found",
      });
    }

    const expectedSecret =
      trigger.config?.secret;

    if (
      expectedSecret &&
      suppliedSecret !== expectedSecret
    ) {
      return res.status(401).json({
        message:
          "Invalid webhook secret",
      });
    }

    const quotaResult =
      await hasura.request(
        RESERVE_QUOTA,
        {
          orgId: workflow.org_id,
        }
      );

    if (
      quotaResult.update_organizations
        .affected_rows !== 1
    ) {
      return res.status(403).json({
        message:
          "Organization quota exhausted",
      });
    }

    const stepsResult =
      await hasura.request(
        GET_STEPS,
        {
          workflowId,
        }
      );

    if (!stepsResult.workflow_steps.length) {
      return res.status(400).json({
        message:
          "Workflow has no steps",
      });
    }

    const runResult =
      await hasura.request(
        CREATE_RUN,
        {
          workflowId,
          startedAt:
            new Date().toISOString(),
        }
      );

    runId =
      runResult
        .insert_workflow_runs_one.id;

    const execution =
      await executeWorkflowRun(
        hasura,
        runId,
        stepsResult.workflow_steps
      );

    return res.json({
      workflow_run_id: runId,
      status: execution.status,
    });
  } catch (error) {
    console.error(
      "webhook trigger error:",
      error
    );

    if (runId) {
      try {
        await hasura.request(
          FAIL_RUN,
          {
            id: runId,
            error:
              error.message ||
              "Webhook workflow failed",
          }
        );
      } catch {}
    }

    return res.status(500).json({
      message:
        error.message ||
        "Webhook trigger failed",
    });
  }
});

module.exports = app;