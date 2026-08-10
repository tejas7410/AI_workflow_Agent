"use client";

import { useState } from "react";
import { nhost } from "@/lib/nhost";

export default function WorkflowCreateTest() {
  const [result, setResult] = useState("");

  async function triggerWorkflow() {
    setResult("Starting workflow...");

    try {
      const response = await nhost.graphql.request({
  query: `
    mutation TriggerWorkflowRun {
      triggerWorkflowRun(
        workflow_id: "a59ff68d-28e6-40a6-93c0-b335b50ec8d3"
      ) {
        workflow_run_id
        status
      }
    }
  `,
});

      setResult(JSON.stringify(response, null, 2));
    } catch (error) {
      setResult(
        error instanceof Error
          ? error.message
          : JSON.stringify(error, null, 2)
      );
    }
  }

  return (
    <main className="min-h-screen bg-black p-8 text-white">
      <h1 className="text-2xl font-bold">
        Workflow Run Test
      </h1>

      <p className="mt-3 text-gray-400">
        Test triggerWorkflowRun as the currently authenticated user.
      </p>

      <button
        onClick={triggerWorkflow}
        className="mt-6 rounded bg-blue-600 px-4 py-2 hover:bg-blue-700"
      >
        Trigger Workflow Run
      </button>

      <pre className="mt-6 whitespace-pre-wrap rounded bg-gray-900 p-4">
        {result}
      </pre>
    </main>
  );
}