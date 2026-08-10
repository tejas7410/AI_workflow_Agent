"use client";

import { useState } from "react";
import { nhost } from "@/lib/nhost";

const WORKFLOW_ID =
  "a59ff68d-28e6-40a6-93c0-b335b50ec8d3";

const STEP_RUN_ID =
  "dd7332eb-076a-42f2-bd1d-64aa24292495";

export default function WorkflowCreateTest() {
  const [result, setResult] = useState("");

  async function showCurrentUser() {
    try {
      const session =
  nhost.getUserSession();

      if (!session) {
        setResult("Not logged in");
        return;
      }

      setResult(
        JSON.stringify(
          {
            userId: session.user?.id,
            email: session.user?.email,
            defaultRole:
              session.user?.defaultRole,
            roles: session.user?.roles,
          },
          null,
          2
        )
      );
    } catch (error) {
      setResult(
        error instanceof Error
          ? error.message
          : JSON.stringify(error, null, 2)
      );
    }
  }

  async function triggerWorkflow() {
    setResult("Triggering workflow...");

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
            workflowId: WORKFLOW_ID,
          },
        });

      setResult(
        JSON.stringify(response, null, 2)
      );
    } catch (error) {
      setResult(
        error instanceof Error
          ? error.message
          : JSON.stringify(error, null, 2)
      );
    }
  }

  async function approveStep() {
    setResult("Approving step...");

    try {
      const response =
        await nhost.graphql.request({
          query: `
            mutation ApproveStep(
              $stepRunId: uuid!
            ) {
              approveStep(
                step_run_id: $stepRunId
              ) {
                step_run_id
                status
                approved_by
                approved_at
                workflow_run_status
              }
            }
          `,
          variables: {
            stepRunId: STEP_RUN_ID,
          },
        });

      setResult(
        JSON.stringify(response, null, 2)
      );
    } catch (error) {
      setResult(
        error instanceof Error
          ? error.message
          : JSON.stringify(error, null, 2)
      );
    }
  }

  return (
    <main className="min-h-screen bg-gray-950 p-8 text-white">
      <h1 className="text-2xl font-bold">
        Workflow Integration Tests
      </h1>

      <p className="mt-2 text-gray-400">
        Temporary integration test dashboard.
      </p>

      <div className="mt-8 flex flex-col gap-4">
        <button
          onClick={showCurrentUser}
          className="w-fit rounded bg-gray-700 px-4 py-2 hover:bg-gray-600"
        >
          Show Current User
        </button>

        <button
          onClick={triggerWorkflow}
          className="w-fit rounded bg-blue-600 px-4 py-2 hover:bg-blue-500"
        >
          Trigger Workflow
        </button>

        <button
          onClick={approveStep}
          className="w-fit rounded bg-green-600 px-4 py-2 hover:bg-green-500"
        >
          Approve Paused Step
        </button>
      </div>

      <pre className="mt-8 whitespace-pre-wrap rounded bg-gray-900 p-4">
        {result}
      </pre>
    </main>
  );
}