import { createWorkflow, createStep } from "@mastra/core/workflows";
import { z } from "zod";

// --- Step 1: データ取得 ---
const fetchDataStep = createStep({
  id: "fetch-data",
  inputSchema: z.object({
    query: z.string(),
  }),
  outputSchema: z.object({
    records: z.array(z.string()),
    count: z.number(),
  }),
  execute: async ({ inputData }) => {
    // 模擬: データ取得に1秒かかる
    await new Promise((r) => setTimeout(r, 1000));
    const records = [
      `Result for "${inputData.query}" #1`,
      `Result for "${inputData.query}" #2`,
      `Result for "${inputData.query}" #3`,
    ];
    return { records, count: records.length };
  },
});

// --- Step 2: サマリー生成 ---
const summarizeStep = createStep({
  id: "summarize",
  inputSchema: z.object({
    records: z.array(z.string()),
    count: z.number(),
  }),
  outputSchema: z.object({
    summary: z.string(),
  }),
  execute: async ({ inputData }) => {
    // 模擬: サマリー生成に1秒かかる
    await new Promise((r) => setTimeout(r, 1000));
    return {
      summary: `Found ${inputData.count} records. Top result: ${inputData.records[0]}`,
    };
  },
});

// --- Workflow 定義 ---
export const dataProcessingWorkflow = createWorkflow({
  id: "data-processing",
  inputSchema: z.object({
    query: z.string(),
  }),
  outputSchema: z.object({
    summary: z.string(),
  }),
  steps: [fetchDataStep, summarizeStep],
})
  .then(fetchDataStep)
  .then(summarizeStep)
  .commit();
