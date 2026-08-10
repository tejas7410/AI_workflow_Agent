require("dotenv").config();

const express = require("express");
const { GraphQLClient, gql } = require("graphql-request");

const app = express();

app.use(express.json());

const PORT = process.env.PORT || 4000;

const HASURA_GRAPHQL_URL = process.env.HASURA_GRAPHQL_URL;
const HASURA_ADMIN_SECRET = process.env.HASURA_ADMIN_SECRET;

if (!HASURA_GRAPHQL_URL || !HASURA_ADMIN_SECRET) {
  console.error(
    "Missing HASURA_GRAPHQL_URL or HASURA_ADMIN_SECRET"
  );
  process.exit(1);
}

const hasura = new GraphQLClient(HASURA_GRAPHQL_URL, {
  headers: {
    "x-hasura-admin-secret": HASURA_ADMIN_SECRET,
  },
});

const GET_WORKFLOW = gql`
  query GetWorkflow($workflowId: uuid!) {
    workflows_by_pk(id: $workflowId) {
      id
      name
      org_id
      status
    }
  }
`;

const GET_ORGANIZATION = gql`
  query GetOrganization($orgId: uuid!) {
    organizations_by_pk(id: $orgId) {
      id
      calls_used
      calls_allowed
    }
  }
`;

const GET_MEMBERSHIP = gql`
  query GetMembership($orgId: uuid!, $userId: uuid!) {
    org_members(
      where: {
        org_id: { _eq: $orgId }
        user_id: { _eq: $userId }
      }
      limit: 1
    ) {
      id
      role
    }
  }
`;

const CREATE_RUN = gql`
  mutation CreateRun(
    $workflowId: uuid!
    $triggerType: String!
    $createdBy: uuid!
    $startedAt: timestamptz!
  ) {
    insert_workflow_runs_one(
      object: {
        workflow_id: $workflowId
        trigger_type: $triggerType
        status: "running"
        started_at: $startedAt
        created_by: $createdBy
      }
    ) {
      id
      status
    }
  }
`;

app.post("/", async (req, res) => {
  try {
    const sessionVariables = req.body.session_variables || {};

    const userId = sessionVariables["x-hasura-user-id"];
    const workflowId = req.body.input?.workflow_id;

    // 1. Authentication
    if (!userId) {
      return res.status(401).json({
        message: "Unauthenticated",
      });
    }

    // 2. Validate input
    if (!workflowId) {
      return res.status(400).json({
        message: "workflow_id is required",
      });
    }

    // 3. Resolve workflow
    const workflowResult = await hasura.request(GET_WORKFLOW, {
      workflowId,
    });

    const workflow = workflowResult.workflows_by_pk;

    if (!workflow) {
      return res.status(404).json({
        message: "Workflow not found",
      });
    }

    // 4. Resolve organization
    const organizationResult = await hasura.request(
      GET_ORGANIZATION,
      {
        orgId: workflow.org_id,
      }
    );

    const organization =
      organizationResult.organizations_by_pk;

    if (!organization) {
      return res.status(404).json({
        message: "Organization not found",
      });
    }

    // 5. Check organization membership
    const membershipResult = await hasura.request(
      GET_MEMBERSHIP,
      {
        orgId: workflow.org_id,
        userId,
      }
    );

    const membership = membershipResult.org_members[0];

    if (!membership) {
      return res.status(403).json({
        message: "Not a member of this organization",
      });
    }

    // 6. Check role
    if (!["owner", "editor"].includes(membership.role)) {
      return res.status(403).json({
        message: "Insufficient role",
      });
    }

    // 7. Check quota
    if (
      organization.calls_used >=
      organization.calls_allowed
    ) {
      return res.status(403).json({
        message: "Organization quota exhausted",
      });
    }

    // 8. Create workflow run
    const runResult = await hasura.request(CREATE_RUN, {
  workflowId,
  triggerType: "manual",
  createdBy: userId,
  startedAt: new Date().toISOString(),
});

    const run = runResult.insert_workflow_runs_one;

    return res.json({
      workflow_run_id: run.id,
      status: run.status,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Failed to start workflow run",
    });
  }
});

module.exports = app;