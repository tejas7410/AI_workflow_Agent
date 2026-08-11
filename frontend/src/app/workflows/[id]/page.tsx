"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { nhost } from "@/lib/nhost";
import TriggerManager from "@/components/TriggerManager";
import WorkflowRunMonitor from "@/components/WorkflowRunMonitor";

type GraphQLBody<T> = {
  data?: T;
};

type WorkflowResponse = {
  workflows_by_pk: Workflow | null;
};

type TriggerWorkflowResponse = {
  triggerWorkflowRun: {
    workflow_run_id: string;
    status: string;
  };
};

type Step = {
  id: string;
  step_order: number;
  name: string;
  type: string;
  config: Record<string, unknown>;
};

type Trigger = {
  id: string;
  type: string;
  enabled: boolean;
  config: Record<string, unknown>;
};

type Workflow = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  org_id: string;
  steps: Step[];
  triggers: Trigger[];
  runs: {
    id: string;
    status: string;
    trigger_type: string;
    created_at: string;
  }[];
};

const STEP_TYPES = [
  "llm_call",
  "http_request",
  "conditional_branch",
  "approval_gate",
];

export default function WorkflowPage() {
  const params = useParams();

  const workflowId = String(params.id);

  const [workflow, setWorkflow] =
    useState<Workflow | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [message, setMessage] =
    useState("");

  const [runId, setRunId] =
    useState<string | null>(null);


  const [running, setRunning] =
    useState(false);

  const [saving, setSaving] =
    useState(false);

  async function loadWorkflow() {
    try {
      setLoading(true);

      const response =
        await nhost.graphql.request({
          query: `
            query GetWorkflow($id: uuid!) {
              workflows_by_pk(id: $id) {
                id
                name
                description
                status
                org_id

                steps: workflow_steps(
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

                triggers: workflow_triggers(
                  order_by: {
                    created_at: asc
                  }
                ) {
                  id
                  type
                  enabled
                  config
                }

                runs: workflow_runs(
                  limit: 5
                  order_by: {
                    created_at: desc
                  }
                ) {
                  id
                  status
                  trigger_type
                  created_at
                }
              }
            }
          `,
          variables: {
            id: workflowId,
          },
        });

      const body =
        response.body as unknown as GraphQLBody<WorkflowResponse>;

      setWorkflow(
        body.data?.workflows_by_pk ?? null
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Failed to load workflow"
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadWorkflow();
  }, [workflowId]);

  async function updateWorkflowStatus(
    status: string
  ) {
    setSaving(true);
    setMessage("");

    try {
      await nhost.graphql.request({
        query: `
          mutation UpdateWorkflowStatus(
            $id: uuid!
            $status: String!
          ) {
            update_workflows_by_pk(
              pk_columns: {
                id: $id
              }
              _set: {
                status: $status
              }
            ) {
              id
              name
              status
            }
          }
        `,
        variables: {
          id: workflowId,
          status,
        },
      });

      await loadWorkflow();

      setMessage(
        status === "active"
          ? "Workflow activated."
          : "Workflow updated."
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Failed to update workflow"
      );
    } finally {
      setSaving(false);
    }
  }

  async function addStep(type: string) {
    if (!workflow) return;

    setSaving(true);
    setMessage("");

    try {
      const order =
        workflow.steps.length + 1;

      let config: Record<string, unknown> =
        {};

      if (type === "llm_call") {
        config = {
          provider: "test",
          model: "test-model",
          prompt:
            "Return the word approved",
        };
      }

      if (type === "http_request") {
        config = {
          method: "GET",
          url: "https://httpbin.org/get",
        };
      }

      if (type === "conditional_branch") {
        config = {
          source:
            "previous.output.text",
          condition: "contains",
          value: "Hello",
        };
      }

      if (type === "approval_gate") {
        config = {
          message:
            "Please approve this workflow.",
        };
      }

      await nhost.graphql.request({
        query: `
          mutation AddStep(
            $workflowId: uuid!
            $order: Int!
            $name: String!
            $type: String!
            $config: jsonb!
          ) {
            insert_workflow_steps_one(
              object: {
                workflow_id: $workflowId
                step_order: $order
                name: $name
                type: $type
                config: $config
              }
            ) {
              id
            }
          }
        `,
        variables: {
          workflowId,
          order,
          name:
            type
              .replaceAll("_", " ")
              .replace(
                /\b\w/g,
                (c) =>
                  c.toUpperCase()
              ),
          type,
          config,
        },
      });

      await loadWorkflow();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Failed to add step"
      );
    } finally {
      setSaving(false);
    }
  }

  async function deleteStep(id: string) {
    try {
      await nhost.graphql.request({
        query: `
          mutation DeleteStep(
            $id: uuid!
          ) {
            delete_workflow_steps_by_pk(
              id: $id
            ) {
              id
            }
          }
        `,
        variables: {
          id,
        },
      });

      await loadWorkflow();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Failed to delete step"
      );
    }
  }

  async function activateWorkflow() {
    await updateWorkflowStatus("active");
  }

  async function runWorkflow() {
  setRunning(true);
  setMessage("");

  try {
    const response =
      await nhost.graphql.request({
        query: `
          mutation TriggerWorkflowRun(
            $workflowId: uuid!
          ) {
            triggerWorkflowRun(
              workflow_id: $workflowId
            ) {
              workflow_run_id
              status
            }
          }
        `,
        variables: {
          workflowId,
        },
      });

    const body =
      response.body as unknown as GraphQLBody<TriggerWorkflowResponse>;

    const result =
      body.data?.triggerWorkflowRun;

    if (!result) {
      throw new Error(
        "No workflow run was returned."
      );
    }

    setRunId(
      result.workflow_run_id
    );

    setMessage(
      `Run started: ${result.status}`
    );

    await loadWorkflow();
  } catch (error) {
    setMessage(
      error instanceof Error
        ? error.message
        : "Failed to run workflow"
    );
  } finally {
    setRunning(false);
  }
}

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-950 p-8 text-white">
        Loading workflow...
      </main>
    );
  }

  if (!workflow) {
    return (
      <main className="min-h-screen bg-slate-950 p-8 text-white">
        <h1 className="text-2xl font-bold">
          Workflow not found
        </h1>

        <Link
          href="/workflows"
          className="mt-4 inline-block text-blue-400"
        >
          Back to workflows
        </Link>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto max-w-6xl p-6">
        <div className="flex items-center justify-between">
          <div>
            <Link
              href="/workflows"
              className="text-sm text-blue-400"
            >
              ← Workflows
            </Link>

            <h1 className="mt-3 text-3xl font-bold">
              {workflow.name}
            </h1>

            <p className="mt-1 text-sm text-slate-400">
              Organization: {workflow.org_id}
            </p>
          </div>

          <div className="flex gap-3">
            <span className="rounded bg-slate-800 px-3 py-2 text-sm">
              {workflow.status}
            </span>

            <button
              onClick={activateWorkflow}
              disabled={
                saving ||
                workflow.status === "active"
              }
              className="rounded bg-green-600 px-4 py-2 font-medium hover:bg-green-500 disabled:opacity-50"
            >
              {workflow.status === "active"
                ? "Active"
                : "Activate"}
            </button>

            <button
              onClick={runWorkflow}
              disabled={
                running ||
                workflow.status !== "active"
              }
              className="rounded bg-blue-600 px-4 py-2 font-medium hover:bg-blue-500 disabled:opacity-50"
            >
              {running
                ? "Running..."
                : "Run workflow"}
            </button>
          </div>
        </div>

        {message && (
  <div className="mt-5 rounded border border-slate-800 bg-slate-900 p-3 text-sm text-slate-300">
    {message}
  </div>
)}


        <section className="mt-8 rounded-xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="text-xl font-semibold">
            Workflow Steps
          </h2>

          <p className="mt-1 text-sm text-slate-400">
            Ordered list builder. This is
            intentionally simple for the assignment.
          </p>

          <div className="mt-5 space-y-3">
            {workflow.steps.map(
              (step, index) => (
                <div
                  key={step.id}
                  className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950 p-4"
                >
                  <div>
                    <div className="flex items-center gap-3">
                      <span className="rounded bg-blue-950 px-2 py-1 text-xs text-blue-300">
                        {index + 1}
                      </span>

                      <span className="font-medium">
                        {step.name}
                      </span>
                    </div>

                    <p className="mt-2 text-xs text-slate-500">
                      {step.type}
                    </p>

                    <pre className="mt-2 max-w-3xl overflow-auto text-xs text-slate-500">
                      {JSON.stringify(
                        step.config,
                        null,
                        2
                      )}
                    </pre>
                  </div>

                  <button
                    onClick={() =>
                      deleteStep(step.id)
                    }
                    className="rounded bg-red-950 px-3 py-2 text-xs text-red-300 hover:bg-red-900"
                  >
                    Delete
                  </button>
                </div>
              )
            )}

            {!workflow.steps.length && (
              <div className="rounded border border-dashed border-slate-800 p-8 text-center text-slate-500">
                No steps yet.
              </div>
            )}
          </div>

          <div className="mt-6 border-t border-slate-800 pt-6">
            <h3 className="font-medium">
              Add step
            </h3>

            <div className="mt-3 flex flex-wrap gap-2">
              {STEP_TYPES.map(
                (type) => (
                  <button
                    key={type}
                    onClick={() =>
                      addStep(type)
                    }
                    disabled={saving}
                    className="rounded bg-slate-800 px-3 py-2 text-sm hover:bg-slate-700 disabled:opacity-50"
                  >
                    +{" "}
                    {type.replaceAll(
                      "_",
                      " "
                    )}
                  </button>
                )
              )}
            </div>
          </div>
        </section>

        <TriggerManager
          workflowId={workflow.id}
          triggers={workflow.triggers}
          onChanged={loadWorkflow}
        />

        <WorkflowRunMonitor
  workflowRunId={runId}
  onRunUpdated={loadWorkflow}
/>

        <section className="mt-8 rounded-xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="text-xl font-semibold">
            Recent Runs
          </h2>

          <div className="mt-4 space-y-2">
            {workflow.runs.map(
              (run) => (
                <div
                  key={run.id}
                  className="flex items-center justify-between rounded border border-slate-800 bg-slate-950 p-3"
                >
                  <div>
                    <p className="text-sm">
                      {run.trigger_type}
                    </p>

                    <p className="text-xs text-slate-500">
                      {run.id}
                    </p>
                  </div>

                  <span className="rounded bg-slate-800 px-3 py-1 text-xs">
                    {run.status}
                  </span>
                </div>
              )
            )}

            {!workflow.runs.length && (
              <p className="text-sm text-slate-500">
                No runs yet.
              </p>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}