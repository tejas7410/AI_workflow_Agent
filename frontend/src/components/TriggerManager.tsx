"use client";

import { useState } from "react";
import { nhost } from "@/lib/nhost";

type Trigger = {
  id: string;
  type: string;
  enabled: boolean;
  config: Record<string, unknown>;
};

type Props = {
  workflowId: string;
  triggers: Trigger[];
  onChanged: () => Promise<void>;
};

export default function TriggerManager({
  workflowId,
  triggers,
  onChanged,
}: Props) {
  const [creating, setCreating] =
    useState(false);

  const [message, setMessage] =
    useState("");

  const [webhookSecret, setWebhookSecret] =
    useState("");

  async function createWebhookTrigger() {
    if (!webhookSecret.trim()) {
      setMessage(
        "Enter a webhook secret."
      );
      return;
    }

    setCreating(true);
    setMessage("");

    try {
      await nhost.graphql.request({
        query: `
          mutation CreateWebhookTrigger(
            $workflowId: uuid!
            $config: jsonb!
          ) {
            insert_workflow_triggers_one(
              object: {
                workflow_id: $workflowId
                type: "webhook"
                enabled: true
                config: $config
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
          workflowId,
          config: {
            secret:
              webhookSecret.trim(),
          },
        },
      });

      setWebhookSecret("");

      setMessage(
        "Webhook trigger created."
      );

      await onChanged();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Failed to create webhook trigger"
      );
    } finally {
      setCreating(false);
    }
  }

  async function toggleTrigger(
    trigger: Trigger
  ) {
    try {
      await nhost.graphql.request({
        query: `
          mutation ToggleTrigger(
            $id: uuid!
            $enabled: Boolean!
          ) {
            update_workflow_triggers_by_pk(
              pk_columns: {
                id: $id
              }
              _set: {
                enabled: $enabled
              }
            ) {
              id
              enabled
            }
          }
        `,
        variables: {
          id: trigger.id,
          enabled: !trigger.enabled,
        },
      });

      await onChanged();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Failed to update trigger"
      );
    }
  }

  async function deleteTrigger(
    triggerId: string
  ) {
    try {
      await nhost.graphql.request({
        query: `
          mutation DeleteTrigger(
            $id: uuid!
          ) {
            delete_workflow_triggers_by_pk(
              id: $id
            ) {
              id
            }
          }
        `,
        variables: {
          id: triggerId,
        },
      });

      setMessage(
        "Trigger deleted."
      );

      await onChanged();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Failed to delete trigger"
      );
    }
  }

  return (
    <section className="mt-8 rounded-lg border border-gray-800 bg-gray-900 p-5">
      <h2 className="text-xl font-semibold">
        Triggers
      </h2>

      <p className="mt-1 text-sm text-gray-500">
        Manual execution is available
        through the Run button. Add a
        webhook for non-manual execution.
      </p>

      <div className="mt-5 space-y-3">
        {triggers.map(
          (trigger) => (
            <div
              key={trigger.id}
              className="rounded-lg border border-gray-800 bg-gray-950 p-4"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">
                    {trigger.type}
                  </p>

                  <p className="mt-1 text-xs text-gray-500">
                    {trigger.enabled
                      ? "Enabled"
                      : "Disabled"}
                  </p>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() =>
                      toggleTrigger(
                        trigger
                      )
                    }
                    className="rounded bg-gray-800 px-3 py-1 text-sm hover:bg-gray-700"
                  >
                    {trigger.enabled
                      ? "Disable"
                      : "Enable"}
                  </button>

                  <button
                    onClick={() =>
                      deleteTrigger(
                        trigger.id
                      )
                    }
                    className="rounded bg-red-900 px-3 py-1 text-sm hover:bg-red-800"
                  >
                    Delete
                  </button>
                </div>
              </div>

              {trigger.type ===
                "webhook" && (
                <div className="mt-3 rounded bg-gray-900 p-3">
                  <p className="text-xs text-gray-500">
                    Webhook endpoint
                  </p>

                  <p className="mt-1 break-all text-sm text-gray-300"> /api/webhookTrigger?workflow_id= {String( trigger.config?.workflow_id ?? "WORKFLOW_ID" )} </p>
                </div>
              )}
            </div>
          )
        )}

        {!triggers.length && (
          <div className="rounded-lg border border-dashed border-gray-800 p-6 text-center text-gray-500">
            No triggers configured.
          </div>
        )}
      </div>

      <div className="mt-6 border-t border-gray-800 pt-6">
        <h3 className="font-medium">
          Add Webhook Trigger
        </h3>

        <p className="mt-1 text-sm text-gray-500">
          Enter the secret that will be
          required by the webhook endpoint.
        </p>

        <div className="mt-4 flex gap-3">
          <input
            type="password"
            value={webhookSecret}
            onChange={(event) =>
              setWebhookSecret(
                event.target.value
              )
            }
            placeholder="Webhook secret"
            className="flex-1 rounded border border-gray-700 bg-gray-950 px-4 py-2 text-white"
          />

          <button
            onClick={
              createWebhookTrigger
            }
            disabled={creating}
            className="rounded bg-blue-600 px-5 py-2 font-medium hover:bg-blue-500 disabled:opacity-50"
          >
            {creating
              ? "Creating..."
              : "Add Webhook"}
          </button>
        </div>
      </div>

      {message && (
        <p className="mt-4 text-sm text-gray-400">
          {message}
        </p>
      )}
    </section>
  );
}