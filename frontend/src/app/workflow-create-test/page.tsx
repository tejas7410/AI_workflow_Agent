"use client";

import { useState } from "react";
import { nhost } from "@/lib/nhost";

export default function WorkflowCreateTest() {
  const [result, setResult] = useState("");

  async function deleteStep() {
    const response = await nhost.graphql.request({
  query: `
    mutation CreateManualTrigger {
      insert_workflow_triggers_one(
        object: {
          workflow_id: "a59ff68d-28e6-40a6-93c0-b335b50ec8d3"
          type: "manual"
          enabled: true
          config: {}
        }
      ) {
        id
        workflow_id
        type
        enabled
        config
      }
    }
  `,
});

setResult(JSON.stringify(response, null, 2));
  }
  return (
    <main className="min-h-screen p-8 text-white">
      <h1 className="text-2xl font-bold">
        Workflow Step Delete Permission Test
      </h1>

      <button
        onClick={deleteStep}
        className="mt-6 rounded bg-blue-600 px-4 py-2"
      >
        Delete Step
      </button>

      <pre className="mt-6 whitespace-pre-wrap">
        {result}
      </pre>
    </main>
  );
}