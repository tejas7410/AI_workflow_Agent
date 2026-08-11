require("dotenv").config();

const {
  gql,
} = require("graphql-request");

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
        attempt_count: 1
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
    }
  }
`;

const FAIL_STEP_RUN = gql`
  mutation FailStepRun(
    $id: uuid!
    $error: String!
  ) {
    update_step_runs_by_pk(
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

const RETRY_STEP_RUN = gql`
  mutation RetryStepRun(
    $id: uuid!
    $attemptCount: Int!
    $error: String!
  ) {
    update_step_runs_by_pk(
      pk_columns: { id: $id }
      _set: {
        status: "running"
        attempt_count: $attemptCount
        error: $error
      }
    ) {
      id
      status
      attempt_count
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

const RESUME_WORKFLOW_RUN = gql`
  mutation ResumeWorkflowRun(
    $id: uuid!
  ) {
    update_workflow_runs_by_pk(
      pk_columns: { id: $id }
      _set: {
        status: "running"
        paused_at: null
      }
    ) {
      id
      status
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

const GET_RUN_STEP_OUTPUTS = gql`
  query GetRunStepOutputs(
    $workflowRunId: uuid!
  ) {
    step_runs(
      where: {
        workflow_run_id: {
          _eq: $workflowRunId
        }
      }
      order_by: {
        created_at: asc
      }
    ) {
      id
      workflow_step_id
      status
      output

      workflow_step {
        type
      }
    }
  }
`;

function executeHttpRequest(config) {
  return (async () => {
    const method =
      (config.method || "GET").toUpperCase();

    const url = config.url;

    if (!url) {
      throw new Error(
        "http_request requires config.url"
      );
    }

    if (
      !["GET", "POST"].includes(method)
    ) {
      throw new Error(
        "Only GET and POST are supported"
      );
    }

    const controller =
      new AbortController();

    const timeout =
      setTimeout(
        () => controller.abort(),
        10000
      );

    try {
      const options = {
        method,
        headers:
          config.headers || {},
        signal:
          controller.signal,
      };

      if (
        config.body !== undefined &&
        method !== "GET"
      ) {
        options.body =
          typeof config.body === "string"
            ? config.body
            : JSON.stringify(config.body);

        if (
          !options.headers[
            "Content-Type"
          ]
        ) {
          options.headers[
            "Content-Type"
          ] = "application/json";
        }
      }

      const response =
        await fetch(url, options);

      const text =
        await response.text();

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
    } finally {
      clearTimeout(timeout);
    }
  })();
}

function evaluateConditional(
  config,
  previousOutput
) {
  let value = previousOutput;

  if (
    config.source ===
    "previous.output.text"
  ) {
    value =
      previousOutput?.text;
  }

  if (
    config.condition ===
    "contains"
  ) {
    return String(
      value || ""
    ).includes(
      String(
        config.value || ""
      )
    );
  }

  if (
    config.condition ===
    "equals"
  ) {
    return value === config.value;
  }

  throw new Error(
    `Unsupported conditional condition: ${config.condition}`
  );
}

async function executeStepWithRetry(
  hasura,
  workflowRunId,
  step
) {
  const stepRunResult =
    await hasura.request(
      CREATE_STEP_RUN,
      {
        workflowRunId,
        workflowStepId:
          step.id,
        input:
          step.config || {},
        startedAt:
          new Date().toISOString(),
      }
    );

  const stepRun =
    stepRunResult
      .insert_step_runs_one;

  let attempt = 1;

  while (attempt <= 2) {
    try {
      let output;

      if (
        step.type ===
        "llm_call"
      ) {
        if (
          step.config?.provider !==
          "test"
        ) {
          throw new Error(
            "Only the test LLM provider is configured"
          );
        }

        output = {
          provider: "test",
          model:
            step.config.model ||
            null,
          prompt:
            step.config.prompt ||
            "",
          text:
            "Hello from the test LLM",
        };
      } else if (
        step.type ===
        "http_request"
      ) {
        output =
          await executeHttpRequest(
            step.config || {}
          );
      } else {
        throw new Error(
          `Step type cannot be executed here: ${step.type}`
        );
      }

      await hasura.request(
        COMPLETE_STEP_RUN,
        {
          id: stepRun.id,
          output,
          completedAt:
            new Date().toISOString(),
        }
      );

      return {
        stepRunId:
          stepRun.id,
        output,
      };
    } catch (error) {
      if (attempt >= 2) {
        await hasura.request(
          FAIL_STEP_RUN,
          {
            id: stepRun.id,
            error:
              error.message ||
              "Step failed",
          }
        );

        throw error;
      }

      attempt += 1;

      await hasura.request(
        RETRY_STEP_RUN,
        {
          id: stepRun.id,
          attemptCount:
            attempt,
          error:
            error.message ||
            "Step failed; retrying",
        }
      );
    }
  }
}

async function executeWorkflowRun(
  hasura,
  workflowRunId,
  steps,
  startIndex = 0,
  initialLlmOutput = null
) {
  let lastLlmOutput =
    initialLlmOutput;

  for (
    let index = startIndex;
    index < steps.length;
    index++
  ) {
    const step =
      steps[index];

    if (
      step.type ===
        "llm_call" ||
      step.type ===
        "http_request"
    ) {
      const result =
        await executeStepWithRetry(
          hasura,
          workflowRunId,
          step
        );

      if (
        step.type ===
        "llm_call"
      ) {
        lastLlmOutput =
          result.output;
      }

      continue;
    }

    if (
      step.type ===
      "conditional_branch"
    ) {
      const stepRunResult =
        await hasura.request(
          CREATE_STEP_RUN,
          {
            workflowRunId,
            workflowStepId:
              step.id,
            input:
              step.config || {},
            startedAt:
              new Date().toISOString(),
          }
        );

      const stepRun =
        stepRunResult
          .insert_step_runs_one;

      const conditionMet =
        evaluateConditional(
          step.config || {},
          lastLlmOutput
        );

      const output = {
        condition_met:
          conditionMet,
        source:
          step.config?.source ||
          null,
        value:
          step.config?.value ||
          null,
      };

      await hasura.request(
        COMPLETE_STEP_RUN,
        {
          id: stepRun.id,
          output,
          completedAt:
            new Date().toISOString(),
        }
      );

      if (!conditionMet) {
        const completed =
          await hasura.request(
            COMPLETE_WORKFLOW_RUN,
            {
              id: workflowRunId,
              completedAt:
                new Date().toISOString(),
            }
          );

        return {
          status:
            completed
              .update_workflow_runs_by_pk
              .status,
        };
      }

      continue;
    }

    if (
      step.type ===
      "approval_gate"
    ) {
      const stepRunResult =
        await hasura.request(
          CREATE_STEP_RUN,
          {
            workflowRunId,
            workflowStepId:
              step.id,
            input:
              step.config || {},
            startedAt:
              new Date().toISOString(),
          }
        );

      const stepRun =
        stepRunResult
          .insert_step_runs_one;

      const output = {
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
          id: workflowRunId,
          pausedAt:
            new Date().toISOString(),
        }
      );

      return {
        status: "paused",
        waitingForApproval:
          stepRun.id,
      };
    }

    throw new Error(
      `Step type not implemented: ${step.type}`
    );
  }

  const completed =
    await hasura.request(
      COMPLETE_WORKFLOW_RUN,
      {
        id: workflowRunId,
        completedAt:
          new Date().toISOString(),
      }
    );

  return {
    status:
      completed
        .update_workflow_runs_by_pk
        .status,
  };
}

async function resumeWorkflowRun(
  hasura,
  workflowRunId,
  workflowId,
  approvedStepId
) {
  const stepsResult =
    await hasura.request(
      GET_WORKFLOW_STEPS,
      {
        workflowId,
      }
    );

  const steps =
    stepsResult.workflow_steps;

  const approvalIndex =
    steps.findIndex(
      (step) =>
        step.id ===
        approvedStepId
    );

  if (approvalIndex === -1) {
    throw new Error(
      "Approval step does not belong to workflow"
    );
  }

  const previousResult =
    await hasura.request(
      GET_RUN_STEP_OUTPUTS,
      {
        workflowRunId,
      }
    );

  let lastLlmOutput =
    null;

  for (
    const stepRun of
    previousResult.step_runs
  ) {
    if (
      stepRun.workflow_step?.type ===
        "llm_call" &&
      stepRun.output
    ) {
      lastLlmOutput =
        stepRun.output;
    }
  }

  await hasura.request(
    RESUME_WORKFLOW_RUN,
    {
      id: workflowRunId,
    }
  );

  return executeWorkflowRun(
    hasura,
    workflowRunId,
    steps,
    approvalIndex + 1,
    lastLlmOutput
  );
}

module.exports = {
  executeWorkflowRun,
  resumeWorkflowRun,
};