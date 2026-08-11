"use client";

import { useState } from "react";
import { nhost } from "@/lib/nhost";
import {
  useStepRunsSubscription,
} from "@/hooks/useStepRunsSubscription";

type Props = {
  workflowRunId: string | null;
  onRunUpdated?: () => void;
};

type ApproveStepResult = {
  step_run_id: string;
  status: string;
  approved_by: string | null;
  approved_at: string | null;
};

type ApproveStepResponse = {
  approveStep?: ApproveStepResult;
};

type GraphQLResponse = {
  data?: ApproveStepResponse;
};

export default function WorkflowRunMonitor({
  workflowRunId,
  onRunUpdated,
}: Props) {
  const {
    stepRuns,
    error,
  } =
    useStepRunsSubscription(
      workflowRunId
    );

  const [approving, setApproving] =
    useState<string | null>(null);

  const [message, setMessage] =
    useState("");

  async function approve(
    stepRunId: string
  ) {
    setApproving(stepRunId);
    setMessage("");

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

      const body =
        response.body as unknown as GraphQLResponse;

      const result =
        body.data?.approveStep;

      if (!result) {
        throw new Error(
          "Approval response was empty."
        );
      }

      if (
        result.status ===
        "approved"
      ) {
        setMessage(
          "Approval accepted. Workflow resumed."
        );

        /*
         * Refresh workflow + Recent Runs.
         *
         * The step subscription continues
         * handling live step updates.
         */
        onRunUpdated?.();
      } else {
        setMessage(
          "Approval completed."
        );
      }
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Approval failed"
      );
    } finally {
      setApproving(null);
    }
  }

  if (!workflowRunId) {
    return null;
  }

  return (
    <section className="mt-8 rounded-xl border border-slate-800 bg-slate-900 p-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-semibold">
            Live Run
          </h2>

          <p className="mt-1 break-all text-xs text-slate-500">
            Run: {workflowRunId}
          </p>
        </div>

        <span className="rounded bg-green-950 px-3 py-1 text-xs text-green-400">
          LIVE
        </span>
      </div>

      {error && (
        <div className="mt-4 rounded bg-yellow-950 p-3 text-sm text-yellow-300">
          {error}
        </div>
      )}

      {message && (
        <div className="mt-4 rounded bg-blue-950 p-3 text-sm text-blue-300">
          {message}
        </div>
      )}

      <div className="mt-5 space-y-3">
        {stepRuns.map(
          (stepRun, index) => {
            const isPaused =
              stepRun.status ===
              "paused";

            return (
              <div
                key={stepRun.id}
                className="rounded-lg border border-slate-800 bg-slate-950 p-4"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <span className="mr-3 text-xs text-slate-500">
                      Step {index + 1}
                    </span>

                    <span className="text-sm font-medium">
                      {stepRun.workflow_step_id}
                    </span>
                  </div>

                  <span className="rounded bg-slate-800 px-3 py-1 text-xs">
                    {stepRun.status}
                  </span>
                </div>

                {stepRun.error && (
                  <p className="mt-3 text-sm text-red-400">
                    {stepRun.error}
                  </p>
                )}

                {stepRun.output && (
                  <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-black p-3 text-xs text-slate-300">
                    {JSON.stringify(
                      stepRun.output,
                      null,
                      2
                    )}
                  </pre>
                )}

                {stepRun.attempt_count >
                  1 && (
                  <p className="mt-2 text-xs text-yellow-400">
                    Attempt:{" "}
                    {stepRun.attempt_count}
                  </p>
                )}

                {isPaused && (
                  <div className="mt-4 rounded-lg border border-yellow-800 bg-yellow-950/30 p-4">
                    <p className="font-medium text-yellow-300">
                      Awaiting approval
                    </p>

                    <p className="mt-1 text-sm text-yellow-400">
                      This workflow is paused
                      until an authorized
                      owner/editor approves it.
                    </p>

                    <button
                      onClick={() =>
                        approve(
                          stepRun.id
                        )
                      }
                      disabled={
                        approving ===
                        stepRun.id
                      }
                      className="mt-4 rounded bg-green-600 px-4 py-2 text-sm font-medium hover:bg-green-500 disabled:opacity-50"
                    >
                      {approving ===
                      stepRun.id
                        ? "Approving..."
                        : "Approve"}
                    </button>
                  </div>
                )}
              </div>
            );
          }
        )}

        {!stepRuns.length && (
          <p className="text-sm text-slate-500">
            Waiting for step execution...
          </p>
        )}
      </div>
    </section>
  );
}