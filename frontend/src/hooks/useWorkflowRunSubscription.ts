"use client";

import { useEffect, useState } from "react";
import { createClient } from "graphql-ws";
import { nhost } from "@/lib/nhost";

type WorkflowRun = {
  id: string;
  status: string;
  trigger_type: string;
  started_at: string | null;
  paused_at: string | null;
  completed_at: string | null;
};

type SubscriptionData = {
  workflow_runs: WorkflowRun[];
};

type SubscriptionResult = {
  data?: SubscriptionData;
  errors?: Array<{
    message: string;
  }>;
};

export function useWorkflowRunSubscription(
  workflowRunId: string | null
) {
  const [workflowRun, setWorkflowRun] =
    useState<WorkflowRun | null>(null);

  const [error, setError] =
    useState<string | null>(null);

  useEffect(() => {
    if (!workflowRunId) {
      setWorkflowRun(null);
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
      `wss://${subdomain}.graphql.${region}.nhost.run/v1/graphql`;

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
            "Workflow run WebSocket connecting..."
          );
        },

        connected: () => {
          console.log(
            "Workflow run WebSocket connected."
          );

          if (!stopped) {
            setError(null);
          }
        },

        closed: () => {
          if (!stopped) {
            setError(
              "Workflow run live updates disconnected."
            );
          }
        },

        error: (wsError) => {
          console.error(
            "Workflow run WebSocket error:",
            wsError
          );
        },
      },
    });

    const unsubscribe =
      client.subscribe<SubscriptionData>(
        {
          query: `
            subscription WorkflowRun(
              $workflowRunId: uuid!
            ) {
              workflow_runs(
  where: {
    id: {
      _eq: $workflowRunId
    }
  }
) {
  id
  status
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
                "Workflow run subscription errors:",
                result.errors
              );

              setError(
                result.errors[0].message
              );

              return;
            }

            const run =
              result.data?.workflow_runs?.[0];

            if (run) {
              setWorkflowRun(run);
            }

            setError(null);
          },

          error: (subscriptionError) => {
            if (stopped) {
              return;
            }

            console.error(
              "Workflow run subscription error:",
              subscriptionError
            );

            setError(
              "Workflow run live updates disconnected."
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
    workflowRun,
    status: workflowRun?.status ?? null,
    error,
  };
}