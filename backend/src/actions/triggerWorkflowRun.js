require("dotenv").config();

const express = require("express");
const { GraphQLClient, gql } = require("graphql-request");

const app = express();

app.use(express.json());

const HASURA_GRAPHQL_URL = process.env.HASURA_GRAPHQL_URL;
const HASURA_ADMIN_SECRET = process.env.HASURA_ADMIN_SECRET;

if (!HASURA_GRAPHQL_URL || !HASURA_ADMIN_SECRET) {
  console.error(
    "Missing HASURA_GRAPHQL_URL or HASURA_ADMIN_SECRET"
  );
  process.exit(1);
}

const hasura = new GraphQLClient(HASURA_GRAPHQL_URL, {
  headers: {
    "x-hasura-admin-secret": HASURA_ADMIN_SECRET,
  },
});

const GET_WORKFLOW = gql`
  query GetWorkflow($workflowId: uuid!) {
    workflows_by_pk(id: $workflowId) {
      id
      name
      org_id
      status
    }
  }
`;

const GET_ORGANIZATION = gql`
  query GetOrganization($orgId: uuid!) {
    organizations_by_pk(id: $orgId) {
      id
      calls_used
      calls_allowed
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

const GET_WORKFLOW_STEPS = gql`
  query GetWorkflowSteps($workflowId: uuid!) {
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
  mutation CreateRun(
    $workflowId: uuid!
    $triggerType: String!
    $createdBy: uuid!
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

const CREATE_STEP_RUN = gql`
  mutation CreateStepRun(
    $workflowRunId: uuid!
    $workflowStepId: uuid!
    $input: jsonb
    $startedAt: timestamptz!
  ) {
    insert_step_runs_one(
      object: {
        workflow_run_id: $workflowRunId
        workflow_step_id: $workflowStepId
        status: "running"
        input: $input
        started_at: $startedAt
      }
    ) {
      id
      status
    }
  }
`;

const COMPLETE_STEP_RUN = gql`
  mutation CompleteStepRun(
    $id: uuid!
    $output: jsonb
    $completedAt: timestamptz!
  ) {
    update_step_runs_by_pk(
      pk_columns: { id: $id }
      _set: {
        status: "completed"
        output: $output
        completed_at: $completedAt
      }
    ) {
      id
      status
      output
      completed_at
    }
  }
`;

const PAUSE_STEP_RUN = gql`
  mutation PauseStepRun(
    $id: uuid!
    $output: jsonb
  ) {
    update_step_runs_by_pk(
      pk_columns: { id: $id }
      _set: {
        status: "paused"
        output: $output
      }
    ) {
      id
      status
      output
    }
  }
`;

const COMPLETE_WORKFLOW_RUN = gql`
  mutation CompleteWorkflowRun(
    $id: uuid!
    $completedAt: timestamptz!
  ) {
    update_workflow_runs_by_pk(
      pk_columns: { id: $id }
      _set: {
        status: "completed"
        completed_at: $completedAt
      }
    ) {
      id
      status
    }
  }
`;

const PAUSE_WORKFLOW_RUN = gql`
  mutation PauseWorkflowRun(
    $id: uuid!
    $pausedAt: timestamptz!
  ) {
    update_workflow_runs_by_pk(
      pk_columns: { id: $id }
      _set: {
        status: "paused"
        paused_at: $pausedAt
      }
    ) {
      id
      status
    }
  }
`;

const FAIL_WORKFLOW_RUN = gql`
  mutation FailWorkflowRun(
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
      error
    }
  }
`;

async function executeHttpRequest(config) {
  const method = config.method || "GET";
  const url = config.url;

  if (!url) {
    throw new Error("http_request requires config.url");
  }

  const options = {
    method,
    headers: config.headers || {},
  };

  if (
    config.body !== undefined &&
    method !== "GET" &&
    method !== "HEAD"
  ) {
    options.body =
      typeof config.body === "string"
        ? config.body
        : JSON.stringify(config.body);

    if (!options.headers["Content-Type"]) {
      options.headers["Content-Type"] =
        "application/json";
    }
  }

  const response = await fetch(url, options);

  const text = await response.text();

  let body;

  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }

  if (!response.ok) {
    throw new Error(
      `HTTP request failed with status ${response.status}`
    );
  }

  return {
    status: response.status,
    body,
  };
}

function evaluateConditional(config, llmOutput) {
  const value = llmOutput?.text;

  if (config.condition === "contains") {
    return String(value || "").includes(
      String(config.value || "")
    );
  }

  if (config.condition === "equals") {
    return value === config.value;
  }

  throw new Error(
    `Unsupported conditional condition: ${config.condition}`
  );
}

app.post("/", async (req, res) => {
  let workflowRunId = null;

  try {
    const sessionVariables =
      req.body.session_variables || {};

    const userId =
      sessionVariables["x-hasura-user-id"];

    const workflowId =
      req.body.input?.workflow_id;

    // 1. Authentication
    if (!userId) {
      return res.status(401).json({
        message: "Unauthenticated",
      });
    }

    // 2. Validate input
    if (!workflowId) {
      return res.status(400).json({
        message: "workflow_id is required",
      });
    }

    // 3. Resolve workflow
    const workflowResult =
      await hasura.request(GET_WORKFLOW, {
        workflowId,
      });

    const workflow =
      workflowResult.workflows_by_pk;

    if (!workflow) {
      return res.status(404).json({
        message: "Workflow not found",
      });
    }

    // 4. Resolve organization
    const organizationResult =
      await hasura.request(GET_ORGANIZATION, {
        orgId: workflow.org_id,
      });

    const organization =
      organizationResult.organizations_by_pk;

    if (!organization) {
      return res.status(404).json({
        message: "Organization not found",
      });
    }

    // 5. Organization membership
    const membershipResult =
      await hasura.request(GET_MEMBERSHIP, {
        orgId: workflow.org_id,
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

    // 6. Role
    if (
      !["owner", "editor"].includes(
        membership.role
      )
    ) {
      return res.status(403).json({
        message: "Insufficient role",
      });
    }

    // 7. Quota
    if (
      organization.calls_used >=
      organization.calls_allowed
    ) {
      return res.status(403).json({
        message:
          "Organization quota exhausted",
      });
    }

    // 8. Load workflow steps
    const stepsResult =
      await hasura.request(GET_WORKFLOW_STEPS, {
        workflowId,
      });

    const steps =
      stepsResult.workflow_steps;

    if (!steps || steps.length === 0) {
      return res.status(400).json({
        message: "Workflow has no steps",
      });
    }

    // 9. Create workflow run
    const runResult =
      await hasura.request(CREATE_RUN, {
        workflowId,
        triggerType: "manual",
        createdBy: userId,
        startedAt:
          new Date().toISOString(),
      });

    const run =
      runResult.insert_workflow_runs_one;

    workflowRunId = run.id;

    // Keep the LLM output available for the
    // conditional branch.
    let lastLlmOutput = null;

    // 10. Execute steps in order
    for (const step of steps) {
      const stepStartedAt =
        new Date().toISOString();

      const stepRunResult =
        await hasura.request(
          CREATE_STEP_RUN,
          {
            workflowRunId: run.id,
            workflowStepId: step.id,
            input: step.config,
            startedAt: stepStartedAt,
          }
        );

      const stepRun =
        stepRunResult.insert_step_runs_one;

      let output;

      // ---------------------------------
      // LLM CALL
      // ---------------------------------
      if (
        step.type === "llm_call" &&
        step.config?.provider === "test"
      ) {
        output = {
          provider: "test",
          model:
            step.config.model || null,
          prompt:
            step.config.prompt || "",
          text: "Hello from the test LLM",
        };

        // IMPORTANT:
        // Do NOT use "let" here.
        lastLlmOutput = output;
      }

      // ---------------------------------
      // HTTP REQUEST
      // ---------------------------------
      else if (
        step.type === "http_request"
      ) {
        output =
          await executeHttpRequest(
            step.config || {}
          );
      }

      // ---------------------------------
      // CONDITIONAL BRANCH
      // ---------------------------------
      else if (
        step.type === "conditional_branch"
      ) {
        const result =
          evaluateConditional(
            step.config || {},
            lastLlmOutput
          );

        output = {
          condition_met: result,
          source:
            step.config?.source || null,
          value:
            step.config?.value || null,
        };

        // If false and there is no false_next,
        // complete the workflow here.
        if (!result) {
          await hasura.request(
            COMPLETE_STEP_RUN,
            {
              id: stepRun.id,
              output,
              completedAt:
                new Date().toISOString(),
            }
          );

          const completedRun =
            await hasura.request(
              COMPLETE_WORKFLOW_RUN,
              {
                id: run.id,
                completedAt:
                  new Date().toISOString(),
              }
            );

          return res.json({
            workflow_run_id:
              completedRun
                .update_workflow_runs_by_pk.id,
            status:
              completedRun
                .update_workflow_runs_by_pk.status,
          });
        }
      }

      // ---------------------------------
      // APPROVAL GATE
      // ---------------------------------
      else if (
        step.type === "approval_gate"
      ) {
        output = {
          message:
            step.config?.message ||
            "Approval required",
        };

        await hasura.request(
          PAUSE_STEP_RUN,
          {
            id: stepRun.id,
            output,
          }
        );

        await hasura.request(
          PAUSE_WORKFLOW_RUN,
          {
            id: run.id,
            pausedAt:
              new Date().toISOString(),
          }
        );

        return res.json({
          workflow_run_id: run.id,
          status: "paused",
          waiting_for_approval: stepRun.id,
        });
      }

      // ---------------------------------
      // UNSUPPORTED STEP
      // ---------------------------------
      else {
        throw new Error(
          `Step type not implemented: ${step.type}`
        );
      }

      // Save normal step output.
      await hasura.request(
        COMPLETE_STEP_RUN,
        {
          id: stepRun.id,
          output,
          completedAt:
            new Date().toISOString(),
        }
      );
    }

    // 11. All steps completed
    const completedRun =
      await hasura.request(
        COMPLETE_WORKFLOW_RUN,
        {
          id: run.id,
          completedAt:
            new Date().toISOString(),
        }
      );

    return res.json({
      workflow_run_id:
        completedRun
          .update_workflow_runs_by_pk.id,
      status:
        completedRun
          .update_workflow_runs_by_pk.status,
    });
  } catch (error) {
    console.error(
      "triggerWorkflowRun error:",
      error
    );

    if (workflowRunId) {
      try {
        await hasura.request(
          FAIL_WORKFLOW_RUN,
          {
            id: workflowRunId,
            error:
              error.message ||
              "Workflow execution failed",
          }
        );
      } catch (updateError) {
        console.error(
          "Failed to mark workflow run failed:",
          updateError
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