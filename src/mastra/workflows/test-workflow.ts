import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";

// Step 1: 開始時にwriterで進捗を書き込む
export const step1 = createStep({
  id: "step1",
  inputSchema: z.object({
    value: z.string(),
  }),
  outputSchema: z.object({
    result: z.string(),
  }),
  execute: async ({ inputData, writer }) => {
    // Step1開始を通知
    await writer?.write({
      type: "step-progress",
      message: "step1を開始しました",
    });

    // 簡単な処理
    const result = `Step1: ${inputData.value}`;

    return { result };
  },
});

// Step 2: 終了時にwriterで進捗を書き込む
export const step2 = createStep({
  id: "step2",
  inputSchema: z.object({
    result: z.string(),
  }),
  outputSchema: z.object({
    finalResult: z.string(),
  }),
  execute: async ({ inputData, writer }) => {
    // 簡単な処理
    const finalResult = `${inputData.result} -> Step2完了`;

    // Step2終了を通知
    await writer?.write({
      type: "step-progress",
      message: "step2を終了しました",
    });

    return { finalResult };
  },
});

// Workflowの定義
export const testWorkflow = createWorkflow({
  id: "testWorkflow",
  description: "2つのステップを持つテストワークフロー",
  inputSchema: z.object({
    value: z.string(),
  }),
  outputSchema: z.object({
    finalResult: z.string(),
  }),
  steps: [step1, step2],
})
  .then(step1)
  .then(step2)
  .commit();
