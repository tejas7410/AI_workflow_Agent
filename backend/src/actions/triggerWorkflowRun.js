require("dotenv").config();

const express = require("express");
const { GraphQLClient, gql } = require("graphql-request");

const {
  executeWorkflowRun,
} = require("../workflowEngine");

const app = express();

app.use(express.json());

const HASURA_GRAPHQL_URL =
  process.env.HASURA_GRAPHQL_URL;

const HASURA_ADMIN_SECRET =
  process.env.HASURA_ADMIN_SECRET;

const INTERNAL_TRIGGER_SECRET =
  process.env.INTERNAL_TRIGGER_SECRET;

if (
  !HASURA_GRAPHQL_URL ||
  !HASURA_ADMIN_SECRET
) {
  console.error(
    "Missing HASURA_GRAPHQL_URL or HASURA_ADMIN_SECRET"
  );
  process.exit(1);
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

const GET_WORKFLOW = gql`
  query GetWorkflow(
    $workflowId: uuid!
  ) {
    workflows_by_pk(id: $workflowId) {
      id
      name
      org_id
      status
    }
  }
`;

const GET_ORGANIZATION = gql`
  query GetOrganization(
    $orgId: uuid!
  ) {
    organizations_by_pk(id: $orgId) {
      id
      calls_used
      calls_allowed
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
        org_id: {
          _eq: $orgId
        }
        user_id: {
          _eq: $userId
        }
      }
      limit: 1
    ) {
      id
      role
    }
  }
`;

const GET_WORKFLOW_STEPS = gql`
  query GetWorkflowSteps(
    $workflowId: uuid!
  ) {
    workflow_steps(
      where: {
        workflow_id: {
          _eq: $workflowId
        }
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
  mutation CreateRun(
    $workflowId: uuid!
    $triggerType: String!
    $createdBy: uuid
    $startedAt: timestamptz!
  ) {
    insert_workflow_runs_one(
      object: {
        workflow_id: $workflowId
        trigger_type: $triggerType
        status: "running"
        started_at: $startedAt
        created_by: $createdBy
      }
    ) {
      id
      status
    }
  }
`;

const RESERVE_QUOTA = gql`
  mutation ReserveQuota(
    $orgId: uuid!
  ) {
    update_organizations_by_pk(
      pk_columns: {
        id: $orgId
      }
      _inc: {
        calls_used: 1
      }
    ) {
      id
      calls_used
      calls_allowed
    }
  }
`;

const FAIL_RUN = gql`
  mutation FailRun(
    $id: uuid!
    $error: String!
  ) {
    update_workflow_runs_by_pk(
      pk_columns: {
        id: $id
      }
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
  let workflowRunId = null;

  try {
    /*
     * There are two supported execution paths:
     *
     * 1. Normal authenticated user
     *    Hasura Action -> this endpoint
     *
     * 2. Internal webhook trigger
     *    webhookTrigger -> this endpoint
     */

    const sessionVariables =
      req.body.session_variables || {};

    const userId =
      sessionVariables[
        "x-hasura-user-id"
      ];

    const workflowId =
      req.body.input?.workflow_id ||
      req.body.workflow_id;

    const internalSecret =
      req.headers[
        "x-internal-trigger-secret"
      ];

    const isInternalTrigger =
      Boolean(
        INTERNAL_TRIGGER_SECRET &&
        internalSecret &&
        internalSecret ===
          INTERNAL_TRIGGER_SECRET
      );

    /*
     * ---------------------------------
     * Authentication
     * ---------------------------------
     *
     * Normal execution requires a logged-in
     * Hasura user.
     *
     * Webhook execution instead requires the
     * server-to-server internal secret.
     */

    if (
      !userId &&
      !isInternalTrigger
    ) {
      return res.status(401).json({
        message:
          "Unauthenticated",
      });
    }

    /*
     * ---------------------------------
     * Input
     * ---------------------------------
     */

    if (!workflowId) {
      return res.status(400).json({
        message:
          "workflow_id is required",
      });
    }

    /*
     * ---------------------------------
     * Workflow
     * ---------------------------------
     */

    const workflowResult =
      await hasura.request(
        GET_WORKFLOW,
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

    if (
      workflow.status !==
      "active"
    ) {
      return res.status(400).json({
        message:
          "Only active workflows can run",
      });
    }

    /*
     * ---------------------------------
     * Organization
     * ---------------------------------
     */

    const organizationResult =
      await hasura.request(
        GET_ORGANIZATION,
        {
          orgId:
            workflow.org_id,
        }
      );

    const organization =
      organizationResult
        .organizations_by_pk;

    if (!quotaOrganization) {
      return res.status(404).json({
        message:
          "Organization not found",
      });
    }

    /*
     * ---------------------------------
     * Membership
     * ---------------------------------
     *
     * Normal user execution:
     * owner/editor required.
     *
     * Internal webhook execution:
     * the webhookTrigger action has already
     * authenticated the configured webhook
     * trigger and this endpoint has additionally
     * authenticated the internal server secret.
     */

    if (!isInternalTrigger) {
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
            "Not a member of this organization",
        });
      }

      if (
        !["owner", "editor"].includes(
          membership.role
        )
      ) {
        return res.status(403).json({
          message:
            "Insufficient role",
        });
      }
    }

    /*
     * ---------------------------------
     * Atomic quota reservation
     * ---------------------------------
     */

    const quotaCheck =
  await hasura.request(
    GET_QUOTA,
    {
      orgId:
        workflow.org_id,
    }
  );

const quotaOrganization =
  quotaCheck.organizations_by_pk;

if (!quotaOrganization) {
  return res.status(403).json({
    message:
      "Organization not found",
  });
}

if (
  quotaOrganization.calls_used >=
  quotaOrganization.calls_allowed
) {
  return res.status(403).json({
    message:
      "Organization quota exhausted",
  });
}

await hasura.request(
  RESERVE_QUOTA,
  {
    orgId:
      workflow.org_id,
  }
);

    /*
     * ---------------------------------
     * Steps
     * ---------------------------------
     */

    const stepsResult =
      await hasura.request(
        GET_WORKFLOW_STEPS,
        {
          workflowId,
        }
      );

    const steps =
      stepsResult.workflow_steps;

    if (!steps.length) {
      return res.status(400).json({
        message:
          "Workflow has no steps",
      });
    }

    /*
     * ---------------------------------
     * Create run
     * ---------------------------------
     */

    const triggerType =
      isInternalTrigger
        ? "webhook"
        : "manual";

    const runResult =
      await hasura.request(
        CREATE_RUN,
        {
          workflowId,
          triggerType,
          createdBy:
            userId || null,
          startedAt:
            new Date().toISOString(),
        }
      );

    const run =
      runResult
        .insert_workflow_runs_one;

    workflowRunId = run.id;

    /*
     * ---------------------------------
     * Execute
     * ---------------------------------
     */

    const execution =
      await executeWorkflowRun(
        hasura,
        run.id,
        steps
      );

    return res.json({
      workflow_run_id:
        run.id,

      status:
        execution.status,

      ...(execution.waitingForApproval
        ? {
            waiting_for_approval:
              execution.waitingForApproval,
          }
        : {}),
    });
  } catch (error) {
    console.error(
      "triggerWorkflowRun error:",
      error
    );

    /*
     * If a run was already created,
     * make sure a failed execution is
     * persisted.
     */

    if (workflowRunId) {
      try {
        await hasura.request(
          FAIL_RUN,
          {
            id: workflowRunId,
            error:
              error.message ||
              "Workflow execution failed",
          }
        );
      } catch (
        failureError
      ) {
        console.error(
          "Failed to mark run failed:",
          failureError
        );
      }
    }

    return res.status(500).json({
      message:
        error.message ||
        "Failed to execute workflow",
    });
  }
});

module.exports = app;