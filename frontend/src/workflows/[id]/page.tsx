"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { nhost } from "@/lib/nhost";
import WorkflowRunMonitor from "@/components/WorkflowRunMonitor";
import TriggerManager from "@/components/TriggerManager";

type Step = {
  id: string;
  step_order: number;
  name: string;
  type: string;
  config: Record<string, any>;
};

type Trigger = {
  id: string;
  type: string;
  enabled: boolean;
  config: Record<string, any>;
};

type Workflow = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  org_id: string;
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

  const [steps, setSteps] =
    useState<Step[]>([]);

  const [triggers, setTriggers] =
    useState<Trigger[]>([]);

  const [name, setName] =
    useState("");

  const [description, setDescription] =
    useState("");

  const [message, setMessage] =
    useState("");

  const [running, setRunning] =
    useState(false);

  const [latestRunId, setLatestRunId] =
    useState<string | null>(null);

  useEffect(() => {
    loadWorkflow();
  }, [workflowId]);

  async function loadWorkflow() {
    try {
      const response =
        await nhost.graphql.request({
          query: `
            query GetWorkflow(
              $id: uuid!
            ) {
              workflows_by_pk(id: $id) {
                id
                name
                description
                status
                org_id
              }

              workflow_steps(
                where: {
                  workflow_id: {
                    _eq: $id
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

              workflow_triggers(
                where: {
                  workflow_id: {
                    _eq: $id
                  }
                }
                order_by: {
                  created_at: asc
                }
              ) {
                id
                type
                enabled
                config
              }
            }
          `,
          variables: {
            id: workflowId,
          },
        });

      const data = response.data;

      if (!data?.workflows_by_pk) {
        setMessage("Workflow not found.");
        return;
      }

      setWorkflow(
        data.workflows_by_pk
      );

      setName(
        data.workflows_by_pk.name
      );

      setDescription(
        data.workflows_by_pk.description || ""
      );

      setSteps(
        data.workflow_steps || []
      );

      setTriggers(
        data.workflow_triggers || []
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Failed to load workflow"
      );
    }
  }

  function addStep() {
    const nextOrder =
      steps.length + 1;

    setSteps([
      ...steps,
      {
        id: `new-${Date.now()}`,
        step_order: nextOrder,
        name: `Step ${nextOrder}`,
        type: "llm_call",
        config: {
          provider: "test",
          model: "test-model",
          prompt: "Say hello",
        },
      },
    ]);
  }

  function removeStep(index: number) {
    const updated = steps
      .filter((_, i) => i !== index)
      .map((step, i) => ({
        ...step,
        step_order: i + 1,
      }));

    setSteps(updated);
  }

  function moveStep(
    index: number,
    direction: number
  ) {
    const target = index + direction;

    if (
      target < 0 ||
      target >= steps.length
    ) {
      return;
    }

    const updated = [...steps];

    [
      updated[index],
      updated[target],
    ] = [
      updated[target],
      updated[index],
    ];

    setSteps(
      updated.map((step, i) => ({
        ...step,
        step_order: i + 1,
      }))
    );
  }

  function updateStep(
    index: number,
    patch: Partial<Step>
  ) {
    setSteps(
      steps.map((step, i) =>
        i === index
          ? {
              ...step,
              ...patch,
            }
          : step
      )
    );
  }

  async function saveWorkflow() {
    setMessage("Saving workflow...");

    try {
      await nhost.graphql.request({
        query: `
          mutation UpdateWorkflow(
            $id: uuid!
            $name: String!
            $description: String
          ) {
            update_workflows_by_pk(
              pk_columns: {
                id: $id
              }
              _set: {
                name: $name
                description: $description
              }
            ) {
              id
              name
              description
            }
          }
        `,
        variables: {
          id: workflowId,
          name,
          description:
            description || null,
        },
      });

      for (const step of steps) {
        if (step.id.startsWith("new-")) {
          await nhost.graphql.request({
            query: `
              mutation CreateStep(
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
              order: step.step_order,
              name: step.name,
              type: step.type,
              config: step.config,
            },
          });
        } else {
          await nhost.graphql.request({
            query: `
              mutation UpdateStep(
                $id: uuid!
                $order: Int!
                $name: String!
                $type: String!
                $config: jsonb!
              ) {
                update_workflow_steps_by_pk(
                  pk_columns: {
                    id: $id
                  }
                  _set: {
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
              id: step.id,
              order: step.step_order,
              name: step.name,
              type: step.type,
              config: step.config,
            },
          });
        }
      }

      setMessage("Workflow saved.");

      await loadWorkflow();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Failed to save workflow"
      );
    }
  }

  async function activateWorkflow() {
    setMessage("Activating workflow...");

    try {
      await nhost.graphql.request({
        query: `
          mutation ActivateWorkflow(
            $id: uuid!
          ) {
            update_workflows_by_pk(
              pk_columns: {
                id: $id
              }
              _set: {
                status: "active"
              }
            ) {
              id
              status
            }
          }
        `,
        variables: {
          id: workflowId,
        },
      });

      await loadWorkflow();

      setMessage(
        "Workflow activated."
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Failed to activate workflow"
      );
    }
  }

  async function runWorkflow() {
    setRunning(true);
    setMessage(
      "Starting workflow..."
    );

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

      const run =
        response.data?.triggerWorkflowRun;

      if (run?.workflow_run_id) {
        setLatestRunId(
          run.workflow_run_id
        );
      }

      setMessage(
        JSON.stringify(
          run,
          null,
          2
        )
      );
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

  if (!workflow) {
    return (
      <main className="min-h-screen bg-gray-950 p-8 text-white">
        {message || "Loading..."}
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-950 p-8 text-white">
      <div className="mx-auto max-w-5xl">

        {/* HEADER */}

        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold">
              {name}
            </h1>

            <p className="mt-2 text-gray-400">
              {description ||
                "Workflow configuration"}
            </p>

            <span className="mt-3 inline-block rounded bg-gray-800 px-3 py-1 text-xs">
              {workflow.status}
            </span>
          </div>

          <div className="flex gap-3">
            <button
              onClick={saveWorkflow}
              className="rounded bg-blue-600 px-4 py-2 hover:bg-blue-500"
            >
              Save
            </button>

            {workflow.status !==
              "active" && (
              <button
                onClick={
                  activateWorkflow
                }
                className="rounded bg-green-600 px-4 py-2 hover:bg-green-500"
              >
                Activate
              </button>
            )}

            <button
              onClick={runWorkflow}
              disabled={
                running ||
                workflow.status !==
                  "active"
              }
              className="rounded bg-purple-600 px-4 py-2 disabled:opacity-40"
            >
              {running
                ? "Running..."
                : "Run"}
            </button>
          </div>
        </div>

        {/* WORKFLOW DETAILS */}

        <section className="mt-8 rounded-lg border border-gray-800 bg-gray-900 p-5">
          <h2 className="text-xl font-semibold">
            Workflow
          </h2>

          <input
            value={name}
            onChange={(event) =>
              setName(
                event.target.value
              )
            }
            className="mt-4 w-full rounded border border-gray-700 bg-gray-950 px-4 py-2"
            placeholder="Workflow name"
          />

          <textarea
            value={description}
            onChange={(event) =>
              setDescription(
                event.target.value
              )
            }
            placeholder="Description"
            className="mt-3 w-full rounded border border-gray-700 bg-gray-950 px-4 py-2"
            rows={3}
          />
        </section>

        {/* STEPS */}

        <section className="mt-8">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">
              Steps
            </h2>

            <button
              onClick={addStep}
              className="rounded bg-gray-700 px-4 py-2 hover:bg-gray-600"
            >
              + Add Step
            </button>
          </div>

          <div className="mt-4 space-y-4">
            {steps.map(
              (step, index) => (
                <div
                  key={step.id}
                  className="rounded-lg border border-gray-800 bg-gray-900 p-5"
                >
                  <div className="flex gap-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-600 font-bold">
                      {index + 1}
                    </div>

                    <div className="flex-1">
                      <input
                        value={step.name}
                        onChange={(event) =>
                          updateStep(
                            index,
                            {
                              name: event
                                .target
                                .value,
                            }
                          )
                        }
                        className="w-full rounded border border-gray-700 bg-gray-950 px-3 py-2"
                        placeholder="Step name"
                      />

                      <select
                        value={step.type}
                        onChange={(event) =>
                          updateStep(
                            index,
                            {
                              type: event
                                .target
                                .value,
                            }
                          )
                        }
                        className="mt-3 rounded border border-gray-700 bg-gray-950 px-3 py-2"
                      >
                        {STEP_TYPES.map(
                          (type) => (
                            <option
                              key={type}
                              value={type}
                            >
                              {type}
                            </option>
                          )
                        )}
                      </select>

                      {/* LLM CONFIG */}

                      {step.type ===
                        "llm_call" && (
                        <textarea
                          value={
                            step.config
                              ?.prompt ||
                            ""
                          }
                          onChange={(event) =>
                            updateStep(
                              index,
                              {
                                config: {
                                  ...step.config,
                                  provider:
                                    "test",
                                  model:
                                    "test-model",
                                  prompt:
                                    event
                                      .target
                                      .value,
                                },
                              }
                            )
                          }
                          className="mt-3 w-full rounded border border-gray-700 bg-gray-950 p-3"
                          rows={3}
                          placeholder="LLM prompt"
                        />
                      )}

                      {/* HTTP CONFIG */}

                      {step.type ===
                        "http_request" && (
                        <div className="mt-3 grid gap-3">
                          <select
                            value={
                              step.config
                                ?.method ||
                              "GET"
                            }
                            onChange={(event) =>
                              updateStep(
                                index,
                                {
                                  config: {
                                    ...step.config,
                                    method:
                                      event
                                        .target
                                        .value,
                                  },
                                }
                              )
                            }
                            className="rounded border border-gray-700 bg-gray-950 px-3 py-2"
                          >
                            <option value="GET">
                              GET
                            </option>

                            <option value="POST">
                              POST
                            </option>
                          </select>

                          <input
                            value={
                              step.config
                                ?.url ||
                              ""
                            }
                            onChange={(event) =>
                              updateStep(
                                index,
                                {
                                  config: {
                                    ...step.config,
                                    url:
                                      event
                                        .target
                                        .value,
                                  },
                                }
                              )
                            }
                            placeholder="https://example.com"
                            className="rounded border border-gray-700 bg-gray-950 px-3 py-2"
                          />
                        </div>
                      )}

                      {/* CONDITIONAL CONFIG */}

                      {step.type ===
                        "conditional_branch" && (
                        <div className="mt-3 grid gap-3">
                          <select
                            value={
                              step.config
                                ?.condition ||
                              "contains"
                            }
                            onChange={(event) =>
                              updateStep(
                                index,
                                {
                                  config: {
                                    ...step.config,
                                    condition:
                                      event
                                        .target
                                        .value,
                                    source:
                                      "previous.output.text",
                                  },
                                }
                              )
                            }
                            className="rounded border border-gray-700 bg-gray-950 px-3 py-2"
                          >
                            <option value="contains">
                              contains
                            </option>

                            <option value="equals">
                              equals
                            </option>
                          </select>

                          <input
                            value={
                              step.config
                                ?.value ||
                              ""
                            }
                            onChange={(event) =>
                              updateStep(
                                index,
                                {
                                  config: {
                                    ...step.config,
                                    source:
                                      "previous.output.text",
                                    condition:
                                      step
                                        .config
                                        ?.condition ||
                                      "contains",
                                    value:
                                      event
                                        .target
                                        .value,
                                  },
                                }
                              )
                            }
                            placeholder="Value"
                            className="rounded border border-gray-700 bg-gray-950 px-3 py-2"
                          />

                          <input
                            type="number"
                            value={
                              step.config
                                ?.true_next ??
                              ""
                            }
                            onChange={(event) =>
                              updateStep(
                                index,
                                {
                                  config: {
                                    ...step.config,
                                    true_next:
                                      event
                                        .target
                                        .value
                                        ? Number(
                                            event
                                              .target
                                              .value
                                          )
                                        : null,
                                  },
                                }
                              )
                            }
                            placeholder="True next step order"
                            className="rounded border border-gray-700 bg-gray-950 px-3 py-2"
                          />

                          <input
                            type="number"
                            value={
                              step.config
                                ?.false_next ??
                              ""
                            }
                            onChange={(event) =>
                              updateStep(
                                index,
                                {
                                  config: {
                                    ...step.config,
                                    false_next:
                                      event
                                        .target
                                        .value
                                        ? Number(
                                            event
                                              .target
                                              .value
                                          )
                                        : null,
                                  },
                                }
                              )
                            }
                            placeholder="False next step order"
                            className="rounded border border-gray-700 bg-gray-950 px-3 py-2"
                          />
                        </div>
                      )}

                      {/* APPROVAL CONFIG */}

                      {step.type ===
                        "approval_gate" && (
                        <input
                          value={
                            step.config
                              ?.message ||
                            ""
                          }
                          onChange={(event) =>
                            updateStep(
                              index,
                              {
                                config: {
                                  ...step.config,
                                  message:
                                    event
                                      .target
                                      .value,
                                },
                              }
                            )
                          }
                          placeholder="Approval message"
                          className="mt-3 w-full rounded border border-gray-700 bg-gray-950 px-3 py-2"
                        />
                      )}

                      {/* STEP CONTROLS */}

                      <div className="mt-4 flex gap-2">
                        <button
                          onClick={() =>
                            moveStep(
                              index,
                              -1
                            )
                          }
                          className="rounded bg-gray-800 px-3 py-1 text-sm"
                        >
                          ↑
                        </button>

                        <button
                          onClick={() =>
                            moveStep(
                              index,
                              1
                            )
                          }
                          className="rounded bg-gray-800 px-3 py-1 text-sm"
                        >
                          ↓
                        </button>

                        <button
                          onClick={() =>
                            removeStep(
                              index
                            )
                          }
                          className="rounded bg-red-900 px-3 py-1 text-sm"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )
            )}

            {!steps.length && (
              <div className="rounded-lg border border-dashed border-gray-800 p-8 text-center text-gray-500">
                No steps yet. Click
                "+ Add Step".
              </div>
            )}
          </div>
        </section>

        {/* RUN MONITOR */}

        <WorkflowRunMonitor
          workflowRunId={
            latestRunId
          }
        />

        {/* TRIGGER MANAGER */}

        <TriggerManager
          workflowId={workflowId}
          triggers={triggers}
          onChanged={loadWorkflow}
        />

        {/* MESSAGE */}

        {message && (
          <pre className="mt-8 whitespace-pre-wrap rounded bg-black p-4 text-sm text-gray-300">
            {message}
          </pre>
        )}
      </div>
    </main>
  );
}