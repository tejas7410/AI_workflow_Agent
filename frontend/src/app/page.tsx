"use client";

import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-950 p-8 text-white">
      <div className="mx-auto max-w-6xl">
        <div>
          <p className="text-sm uppercase tracking-widest text-blue-400">
            Dashboard
          </p>

          <h1 className="mt-3 text-4xl font-bold">
            AI Agent Workflow Builder
          </h1>

          <p className="mt-3 max-w-2xl text-slate-400">
            Build, execute and monitor secure
            organization workflows.
          </p>
        </div>

        <div className="mt-10 grid gap-5 md:grid-cols-3">
          <Link
            href="/workflows"
            className="rounded-xl border border-slate-800 bg-slate-900 p-6 hover:border-blue-500"
          >
            <h2 className="text-xl font-semibold">
              Workflows
            </h2>

            <p className="mt-2 text-sm text-slate-400">
              Create and configure workflow steps
              and triggers.
            </p>
          </Link>

          <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
            <h2 className="text-xl font-semibold">
              Live Runs
            </h2>

            <p className="mt-2 text-sm text-slate-400">
              Monitor step execution through
              GraphQL subscriptions.
            </p>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
            <h2 className="text-xl font-semibold">
              Security
            </h2>

            <p className="mt-2 text-sm text-slate-400">
              Organization membership and role
              authorization are enforced server-side.
            </p>
          </div>
        </div>

        <div className="mt-8 rounded-xl border border-blue-900 bg-blue-950/30 p-6">
          <h2 className="text-lg font-semibold">
            Assignment acceptance flow
          </h2>

          <p className="mt-2 text-sm text-blue-200">
            Build → Run → LLM → HTTP → Conditional
            → Approval → Pause → Approve → Resume
          </p>

          <Link
            href="/workflows"
            className="mt-5 inline-block rounded bg-blue-600 px-5 py-2 font-medium hover:bg-blue-500"
          >
            Open Workflows
          </Link>
        </div>
      </div>
    </main>
  );
}