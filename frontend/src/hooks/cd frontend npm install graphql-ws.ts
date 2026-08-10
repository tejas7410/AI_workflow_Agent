"use client";

import { useEffect, useState } from "react";
import { createClient } from "graphql-ws";
import { nhost } from "@/lib/nhost";

export type StepRun = {
  id: string;
  workflow_run_id: string;
  workflow_step_id: string;
  status: string;
  input: Record<string, unknown> | null;
  output: Record<string, unknown> | null;
  error: string | null;
  attempt_count: number;
  approved_by: string | null;
  approved_at: string | null;
  started_at: string | null;
  completed_at: string | null;
};

type SubscriptionResponse = {
  step_runs: StepRun[];
};

function getWebSocketUrl() {
  const graphqlUrl =
    nhost.graphql.url;

  return graphqlUrl
    .replace(/^https:\/\//, "wss://")
    .replace(/^http:\/\//, "ws://");
}

export function useStepRunsSubscription(
  workflowRunId: string | null
) {
  const [stepRuns, setStepRuns] =
    useState<StepRun[]>([]);

  const [error, setError] =
    useState<string | null>(null);

  useEffect(() => {
    if (!workflowRunId) {
      setStepRuns([]);
      setError(null);
      return;
    }

    let disposed = false;

    const client = createClient({
      url: getWebSocketUrl(),

      connectionParams: async () => {
        const session =
          nhost.getUserSession();

        if (!session?.accessToken) {
          throw new Error(
            "No authenticated Nhost session"
          );
        }

        return {
          Authorization:
            `Bearer ${session.accessToken}`,
        };
      },

      retryAttempts: 5,

      shouldRetry: () => true,
    });

    const unsubscribe =
      client.subscribe<SubscriptionResponse>(
        {
          query: `
            subscription StepRuns(
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
                workflow_run_id
                workflow_step_id
                status
                input
                output
                error
                attempt_count
                approved_by
                approved_at
                started_at
                completed_at
              }
            }
          `,

          variables: {
            workflowRunId,
          },
        },

        {
          next: (result) => {
            if (disposed) {
              return;
            }

            if (result.data?.step_runs) {
              setStepRuns(
                result.data.step_runs
              );
            }

            setError(null);
          },

          error: (subscriptionError) => {
            if (disposed) {
              return;
            }

            console.error(
              "Step runs subscription error:",
              subscriptionError
            );

            setError(
              "Live step updates disconnected."
            );
          },

          complete: () => {
            if (disposed) {
              return;
            }

            console.log(
              "Step runs subscription completed"
            );
          },
        }
      );

    return () => {
      disposed = true;
      unsubscribe();
      client.dispose();
    };
  }, [workflowRunId]);

  return {
    stepRuns,
    error,
  };
}