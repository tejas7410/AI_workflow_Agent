"use client";

import { useEffect, useState } from "react";
import { createClient } from "graphql-ws";
import { nhost } from "@/lib/nhost";

export type StepRun = {
  id: string;
  workflow_run_id: string;
  workflow_step_id: string;
  status: string;
  output: Record<string, unknown> | null;
  error: string | null;
  attempt_count: number;
  approved_by: string | null;
  approved_at: string | null;
  started_at: string | null;
  completed_at: string | null;
};

type SubscriptionData = {
  step_runs: StepRun[];
};

type SubscriptionResult = {
  data?: SubscriptionData;
  errors?: Array<{
    message: string;
  }>;
};

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

    let stopped = false;

    const subdomain =
      process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN;

    const region =
      process.env.NEXT_PUBLIC_NHOST_REGION;

    if (!subdomain || !region) {
      setError(
        "Nhost configuration is missing."
      );
      return;
    }

    const wsUrl =
  `wss://${subdomain}.hasura.${region}.nhost.run/v1/graphql`;

    const client = createClient({
      url: wsUrl,

      connectionParams: async () => {
        const session =
          nhost.getUserSession();

        if (!session?.accessToken) {
          throw new Error(
            "No active Nhost session"
          );
        }

        return {
          headers: {
            Authorization:
              `Bearer ${session.accessToken}`,
          },
        };
      },

      retryAttempts: 5,

      on: {
        connecting: () => {
          console.log(
            "GraphQL WebSocket connecting..."
          );
        },

        connected: () => {
          console.log(
            "GraphQL WebSocket connected."
          );

          if (!stopped) {
            setError(null);
          }
        },

        closed: () => {
          if (!stopped) {
            setError(
              "Live updates disconnected."
            );
          }
        },

        error: (wsError) => {
          console.error(
            "GraphQL WebSocket error:",
            wsError
          );
        },
      },
    });

    const unsubscribe =
      client.subscribe<SubscriptionData>(
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
          next: (
            result: SubscriptionResult
          ) => {
            if (stopped) {
              return;
            }

            if (result.errors?.length) {
              console.error(
                "Subscription GraphQL errors:",
                result.errors
              );

              setError(
                result.errors[0].message
              );

              return;
            }

            if (result.data?.step_runs) {
              setStepRuns(
                result.data.step_runs
              );
            }

            setError(null);
          },

          error: (
  subscriptionError
) => {
  if (stopped) {
    return;
  }

  console.error(
    "FULL STEP SUBSCRIPTION ERROR:",
    JSON.stringify(
      subscriptionError,
      null,
      2
    )
  );

  setError(
    "Live updates disconnected."
  );
},

          complete: () => {},
        }
      );

    return () => {
      stopped = true;
      unsubscribe();
      client.dispose();
    };
  }, [workflowRunId]);

  return {
    stepRuns,
    error,
  };
}