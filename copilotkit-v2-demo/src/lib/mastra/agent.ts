import { Agent } from "@mastra/core/agent";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";

const runWorkflowTool = createTool({
  id: "run-data-processing",
  description:
    "Execute the data-processing workflow to fetch data and generate a summary for the given query.",
  inputSchema: z.object({
    query: z.string().describe("The search query to process"),
  }),
  outputSchema: z.object({
    summary: z.string(),
  }),
  execute: async (inputData, context) => {
    const workflow = context?.mastra?.getWorkflow("data-processing");
    if (!workflow) {
      throw new Error("data-processing workflow not found");
    }

    const run = await workflow.createRun();
    const output = run.stream({ inputData: { query: inputData.query } });

    for await (const event of output) {
      if (context?.writer) {
        await context.writer.custom({
          type: "data-workflow-event" as const,
          data: {
            workflowId: output.workflowId,
            runId: output.runId,
            eventType: event.type,
            payload: (event as any).payload,
          },
        });
      }
    }

    const result = await output.result;

    if (result.status === "success" && result.result) {
      return { summary: (result.result as { summary: string }).summary };
    }

    throw new Error(`Workflow failed: ${result.status}`);
  },
});

export const dataAgent = new Agent({
  id: "data-agent",
  name: "Data Agent",
  instructions:
    "You are a data processing assistant. When the user asks you to search or process data, use the run-data-processing tool. Report the result clearly.",
  model: "anthropic/claude-haiku-4-5-20251001",
  tools: {
    "run-data-processing": runWorkflowTool,
  },
});
