require("dotenv").config();

const express = require("express");
const crypto = require("crypto");
const { GraphQLClient, gql } = require("graphql-request");

const app = express();

app.use(express.json());

const HASURA_GRAPHQL_URL =
  process.env.HASURA_GRAPHQL_URL;

const HASURA_ADMIN_SECRET =
  process.env.HASURA_ADMIN_SECRET;

const TRIGGER_WORKFLOW_URL =
  process.env.TRIGGER_WORKFLOW_URL;

const INTERNAL_TRIGGER_SECRET =
  process.env.INTERNAL_TRIGGER_SECRET;

if (
  !HASURA_GRAPHQL_URL ||
  !HASURA_ADMIN_SECRET ||
  !TRIGGER_WORKFLOW_URL ||
  !INTERNAL_TRIGGER_SECRET
) {
  console.error(
    "Missing webhook environment variables"
  );
  process.exit(1);
}

const hasura = new GraphQLClient(
  HASURA_GRAPHQL_URL,
  {
    headers: {
      "x-hasura-admin-secret":
        HASURA_ADMIN_SECRET,
    },
  }
);

const GET_TRIGGER = gql`
  query GetWebhookTrigger(
    $workflowId: uuid!
  ) {
    workflow_triggers(
      where: {
        workflow_id: {
          _eq: $workflowId
        }
        type: {
          _eq: "webhook"
        }
        enabled: {
          _eq: true
        }
      }
      limit: 1
    ) {
      id
      workflow_id
      type
      enabled
      config
    }
  }
`;

function safeEqual(a, b) {
  if (
    typeof a !== "string" ||
    typeof b !== "string"
  ) {
    return false;
  }

  const aBuffer =
    Buffer.from(a);

  const bBuffer =
    Buffer.from(b);

  if (
    aBuffer.length !==
    bBuffer.length
  ) {
    return false;
  }

  return crypto.timingSafeEqual(
    aBuffer,
    bBuffer
  );
}

app.post("/", async (req, res) => {
  try {
    console.log(
      "WEBHOOK TRIGGER BODY:",
      JSON.stringify(req.body)
    );

    const workflowId =
      req.query.workflow_id ||
      req.body?.workflow_id;

    if (!workflowId) {
      return res.status(400).json({
        message:
          "workflow_id is required",
      });
    }

    const providedSecret =
      req.headers[
        "x-webhook-secret"
      ] ||
      req.body?.secret;

    if (!providedSecret) {
      return res.status(401).json({
        message:
          "Webhook secret is required",
      });
    }

    const result =
      await hasura.request(
        GET_TRIGGER,
        {
          workflowId,
        }
      );

    const trigger =
      result.workflow_triggers?.[0];

    if (!trigger) {
      return res.status(404).json({
        message:
          "Enabled webhook trigger not found",
      });
    }

    const configuredSecret =
      trigger.config?.secret;

    if (!configuredSecret) {
      return res.status(500).json({
        message:
          "Webhook trigger has no configured secret",
      });
    }

    if (
      !safeEqual(
        String(providedSecret),
        String(configuredSecret)
      )
    ) {
      return res.status(401).json({
        message:
          "Invalid webhook secret",
      });
    }

    /*
     * The webhook action is now authenticated.
     *
     * We call triggerWorkflowRun through its
     * internal endpoint rather than trusting the
     * public frontend.
     */

    const response =
      await fetch(
        TRIGGER_WORKFLOW_URL,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",

            "x-internal-trigger-secret":
              INTERNAL_TRIGGER_SECRET,
          },

          body: JSON.stringify({
            workflow_id: workflowId,
            trigger_type: "webhook",
            payload:
              req.body?.payload ??
              req.body ??
              {},
          }),
        }
      );

    const text =
      await response.text();

    let data;

    try {
      data = JSON.parse(text);
    } catch {
      data = {
        message: text,
      };
    }

    if (!response.ok) {
      console.error(
        "triggerWorkflowRun returned:",
        response.status,
        data
      );

      return res.status(
        response.status
      ).json(data);
    }

    return res.status(200).json(
      data
    );
  } catch (error) {
    console.error(
      "webhookTrigger error:",
      error
    );

    return res.status(500).json({
      message:
        error.message ||
        "Webhook trigger failed",
    });
  }
});

module.exports = app;