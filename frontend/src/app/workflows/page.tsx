"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { nhost } from "@/lib/nhost";

type Organization = {
  id: string;
  name: string;
  calls_used: number;
  calls_allowed: number;
};

type OrganizationMember = {
  role: string;
  organization: Organization;
};

type OrganizationsResponse = {
  org_members: OrganizationMember[];
};

type Workflow = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  org_id: string;
};

type WorkflowsResponse = {
  workflows: Workflow[];
};

type CreateWorkflowResponse = {
  insert_workflows_one: {
    id: string;
    name: string;
    status: string;
  };
};

export default function WorkflowsPage() {
  const [organizations, setOrganizations] =
    useState<Organization[]>([]);

  const [organizationId, setOrganizationId] =
    useState("");

  const [workflows, setWorkflows] =
    useState<Workflow[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [newName, setNewName] =
    useState("");

  const [message, setMessage] =
    useState("");

  useEffect(() => {
    loadOrganizations();
  }, []);

  useEffect(() => {
    if (organizationId) {
      loadWorkflows(organizationId);
    }
  }, [organizationId]);

  async function loadOrganizations() {
    try {
      setLoading(true);

      const session =
        nhost.getUserSession();

      if (!session?.user?.id) {
        setMessage("Please log in.");
        setLoading(false);
        return;
      }

      const response =
        await nhost.graphql.request<
          OrganizationsResponse
        >({
          query: `
            query GetOrganizations(
              $userId: uuid!
            ) {
              org_members(
                where: {
                  user_id: {
                    _eq: $userId
                  }
                }
              ) {
                role
                organization {
                  id
                  name
                  calls_used
                  calls_allowed
                }
              }
            }
          `,
          variables: {
            userId: session.user.id,
          },
        });

      const members =
        response.body?.data?.org_members ?? [];

      const orgs =
        members.map(
          (member) =>
            member.organization
        );

      setOrganizations(orgs);

      if (orgs.length > 0) {
        setOrganizationId(
          orgs[0].id
        );
      }
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Failed to load organizations"
      );
    } finally {
      setLoading(false);
    }
  }

  async function loadWorkflows(
    orgId: string
  ) {
    try {
      const response =
        await nhost.graphql.request<
          WorkflowsResponse
        >({
          query: `
            query GetWorkflows(
              $orgId: uuid!
            ) {
              workflows(
                where: {
                  org_id: {
                    _eq: $orgId
                  }
                }
                order_by: {
                  created_at: desc
                }
              ) {
                id
                name
                description
                status
                org_id
              }
            }
          `,
          variables: {
            orgId,
          },
        });

      setWorkflows(
        response.body?.data?.workflows ?? []
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Failed to load workflows"
      );
    }
  }

  async function createWorkflow() {
    const trimmedName =
      newName.trim();

    if (!trimmedName) {
      setMessage(
        "Enter a workflow name."
      );
      return;
    }

    if (!organizationId) {
      setMessage(
        "Select an organization first."
      );
      return;
    }

    setMessage(
      "Creating workflow..."
    );

    try {
      const session =
        nhost.getUserSession();

      if (!session?.user?.id) {
        throw new Error(
          "Not authenticated"
        );
      }

      const response =
        await nhost.graphql.request<
          CreateWorkflowResponse
        >({
          query: `
            mutation CreateWorkflow(
              $orgId: uuid!
              $name: String!
              $createdBy: uuid!
            ) {
              insert_workflows_one(
                object: {
                  org_id: $orgId
                  name: $name
                  created_by: $createdBy
                  status: "draft"
                }
              ) {
                id
                name
                status
              }
            }
          `,
          variables: {
            orgId: organizationId,
            name: trimmedName,
            createdBy:
              session.user.id,
          },
        });

      if (
        !response.body?.data
          ?.insert_workflows_one
      ) {
        throw new Error(
          "Workflow was not created."
        );
      }

      setNewName("");

      setMessage(
        "Workflow created."
      );

      await loadWorkflows(
        organizationId
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Failed to create workflow"
      );
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-950 p-8 text-white">
        Loading...
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto max-w-6xl p-8">
        <h1 className="text-3xl font-bold">
          Workflows
        </h1>

        <p className="mt-2 text-gray-400">
          Build and run organization workflows.
        </p>

        {organizations.length > 0 && (
          <div className="mt-6">
            <label className="block text-sm text-gray-400">
              Organization
            </label>

            <select
              value={organizationId}
              onChange={(event) =>
                setOrganizationId(
                  event.target.value
                )
              }
              className="mt-2 rounded border border-gray-700 bg-gray-900 px-4 py-2"
            >
              {organizations.map(
                (org) => (
                  <option
                    key={org.id}
                    value={org.id}
                  >
                    {org.name}
                  </option>
                )
              )}
            </select>
          </div>
        )}

        {organizations.length === 0 && (
          <div className="mt-6 rounded-lg border border-yellow-900 bg-yellow-950/30 p-4 text-yellow-300">
            You are not a member of any
            organization.
          </div>
        )}

        {organizationId && (
          <div className="mt-6 rounded-lg border border-gray-800 bg-gray-900 p-4">
            <div className="flex gap-3">
              <input
                value={newName}
                onChange={(event) =>
                  setNewName(
                    event.target.value
                  )
                }
                onKeyDown={(event) => {
                  if (
                    event.key === "Enter"
                  ) {
                    createWorkflow();
                  }
                }}
                placeholder="Workflow name"
                className="flex-1 rounded border border-gray-700 bg-gray-950 px-4 py-2 outline-none focus:border-blue-500"
              />

              <button
                onClick={
                  createWorkflow
                }
                className="rounded bg-blue-600 px-5 py-2 font-medium hover:bg-blue-500"
              >
                Create
              </button>
            </div>
          </div>
        )}

        {message && (
          <p className="mt-4 text-sm text-gray-400">
            {message}
          </p>
        )}

        <div className="mt-8 grid gap-4">
          {workflows.map(
            (workflow) => (
              <Link
                key={workflow.id}
                href={`/workflows/${workflow.id}`}
                className="rounded-lg border border-gray-800 bg-gray-900 p-5 hover:border-blue-500"
              >
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold">
                    {workflow.name}
                  </h2>

                  <span className="rounded bg-gray-800 px-3 py-1 text-xs">
                    {workflow.status}
                  </span>
                </div>

                {workflow.description && (
                  <p className="mt-2 text-sm text-gray-400">
                    {
                      workflow.description
                    }
                  </p>
                )}
              </Link>
            )
          )}

          {!workflows.length && (
            <div className="rounded-lg border border-dashed border-gray-800 p-8 text-center text-gray-500">
              No workflows yet.
            </div>
          )}
        </div>
      </div>
    </main>
  );
}