export default function Home() {
  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-6 py-12">
        <header className="mb-16">
          <p className="mb-3 text-sm font-medium uppercase tracking-widest text-blue-400">
            AI Workflow Builder
          </p>

          <h1 className="max-w-3xl text-4xl font-bold tracking-tight sm:text-6xl">
            Build and run secure AI workflows.
          </h1>

          <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300">
            A multi-tenant workflow platform for building, executing, and
            monitoring AI-powered workflows.
          </p>
        </header>

        <section className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
            <h2 className="text-lg font-semibold">Workflows</h2>
            <p className="mt-2 text-sm text-slate-400">
              Create and configure ordered workflow steps.
            </p>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
            <h2 className="text-lg font-semibold">Server-side execution</h2>
            <p className="mt-2 text-sm text-slate-400">
              Workflow execution will remain behind the Hasura API boundary.
            </p>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
            <h2 className="text-lg font-semibold">Live runs</h2>
            <p className="mt-2 text-sm text-slate-400">
              Execution status will eventually update through GraphQL
              subscriptions.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}