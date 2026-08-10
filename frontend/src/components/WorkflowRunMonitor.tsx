"use client";

import { useState } from "react";
import { nhost } from "@/lib/nhost";
import { useStepRunsSubscription } from "@/hooks/useStepRunsSubscription";

type Props = {
  workflowRunId: string | null;
};

export default function WorkflowRunMonitor({
  workflowRunId,
}: Props) {
  const {
    stepRuns,
    error,
  } = useStepRunsSubscription(
    workflowRunId
  );

  const [approvalMessage, setApprovalMessage] =
    useState<string | null>(null);

  const [approving, setApproving] =
    useState(false);

  async function approveStep(
    stepRunId: string
  ) {
    setApproving(true);
    setApprovalMessage(null);

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
              }
            }
          `,
          variables: {
            stepRunId,
          },
        });

      setApprovalMessage(
        JSON.stringify(
          response.data?.approveStep,
          null,
          2
        )
      );
    } catch (err) {
      setApprovalMessage(
        err instanceof Error
          ? err.message
          : "Approval failed"
      );
    } finally {
      setApproving(false);
    }
  }

  if (!workflowRunId) {
    return (
      <section className="mt-8 rounded-lg border border-gray-800 bg-gray-900 p-5">
        <h2 className="text-xl font-semibold">
          Latest Run
        </h2>

        <p className="mt-3 text-gray-500">
          No workflow run selected.
        </p>
      </section>
    );
  }

  return (
    <section className="mt-8 rounded-lg border border-gray-800 bg-gray-900 p-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">
            Workflow Run
          </h2>

          <p className="mt-1 break-all text-xs text-gray-500">
            {workflowRunId}
          </p>
        </div>

        <span className="rounded bg-blue-950 px-3 py-1 text-xs text-blue-300">
          Live
        </span>
      </div>

      {error && (
        <div className="mt-4 rounded bg-red-950 p-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="mt-6 space-y-3">
        {stepRuns.map((stepRun, index) => {
          const isPaused =
            stepRun.status === "paused";

          const isCompleted =
            stepRun.status === "completed" ||
            stepRun.status === "approved";

          const isFailed =
            stepRun.status === "failed";

          return (
            <div
              key={stepRun.id}
              className="rounded-lg border border-gray-800 bg-gray-950 p-4"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${
                      isCompleted
                        ? "bg-green-700"
                        : isFailed
                        ? "bg-red-700"
                        : isPaused
                        ? "bg-yellow-700"
                        : "bg-blue-700"
                    }`}
                  >
                    {index + 1}
                  </div>

                  <div>
                    <p className="font-medium">
                      Step {index + 1}
                    </p>

                    <p className="text-xs text-gray-500">
                      {stepRun.workflow_step_id}
                    </p>
                  </div>
                </div>

                <span
                  className={`rounded px-3 py-1 text-xs ${
                    isCompleted
                      ? "bg-green-950 text-green-300"
                      : isFailed
                      ? "bg-red-950 text-red-300"
                      : isPaused
                      ? "bg-yellow-950 text-yellow-300"
                      : "bg-gray-800 text-gray-300"
                  }`}
                >
                  {stepRun.status}
                </span>
              </div>

              {stepRun.error && (
                <div className="mt-3 rounded bg-red-950 p-3 text-sm text-red-300">
                  {stepRun.error}
                </div>
              )}

              {stepRun.attempt_count > 1 && (
                <p className="mt-3 text-xs text-gray-500">
                  Attempts:{" "}
                  {stepRun.attempt_count}
                </p>
              )}

              {isPaused && (
                <button
                  onClick={() =>
                    approveStep(stepRun.id)
                  }
                  disabled={approving}
                  className="mt-4 rounded bg-green-600 px-4 py-2 text-sm font-medium hover:bg-green-500 disabled:opacity-50"
                >
                  {approving
                    ? "Approving..."
                    : "Approve"}
                </button>
              )}

              {stepRun.approved_at && (
                <p className="mt-3 text-xs text-green-400">
                  Approved at{" "}
                  {new Date(
                    stepRun.approved_at
                  ).toLocaleString()}
                </p>
              )}
            </div>
          );
        })}

        {!stepRuns.length && (
          <p className="py-6 text-center text-gray-500">
            Waiting for step runs...
          </p>
        )}
      </div>

      {approvalMessage && (
        <pre className="mt-5 whitespace-pre-wrap rounded bg-black p-3 text-xs text-gray-400">
          {approvalMessage}
        </pre>
      )}
    </section>
  );
}