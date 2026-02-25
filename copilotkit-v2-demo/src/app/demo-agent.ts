import {
  AbstractAgent,
  EventType,
  type BaseEvent,
  type RunAgentInput,
} from "@ag-ui/client";
import { Observable } from "rxjs";

/**
 * Mastra workflow のステップ進捗をシミュレーションするデモAgent。
 *
 * 各ステップごとに個別の ACTIVITY_SNAPSHOT を発行し、
 * 実行中のステップだけがUIに表示される。
 */

interface WorkflowStep {
  id: string;
  name: string;
  durationMs: number;
  output: string;
}

const WORKFLOW_STEPS: WorkflowStep[] = [
  { id: "fetch-data", name: "Fetch Data", durationMs: 3600, output: "Retrieved 142 records" },
  { id: "validate", name: "Validate Schema", durationMs: 2400, output: "All records valid" },
  { id: "transform", name: "Transform & Enrich", durationMs: 4500, output: "Enriched with 3 sources" },
  { id: "generate-summary", name: "Generate Summary (LLM)", durationMs: 6000, output: "Summary generated (384 tokens)" },
  { id: "store-result", name: "Store Result", durationMs: 1800, output: "Saved to vector store" },
];

export class DemoAgent extends AbstractAgent {
  clone(): DemoAgent {
    return new DemoAgent();
  }

  run(_input: RunAgentInput): Observable<BaseEvent> {
    return new Observable<BaseEvent>((subscriber) => {
      const userMessage =
        _input.messages?.at(-1)?.content ?? "";
      const topic = typeof userMessage === "string" ? userMessage : "data processing";

      const emit = (event: BaseEvent) => subscriber.next(event);

      (async () => {
        try {
          emit({ type: EventType.RUN_STARTED } as BaseEvent);

          const workflowName = "data-pipeline";
          const totalSteps = WORKFLOW_STEPS.length;
          // 全ステップで同一のmessageIdを使い、同じカードをインプレース更新
          const activityId = `workflow-${Date.now()}`;

          for (let i = 0; i < totalSteps; i++) {
            const step = WORKFLOW_STEPS[i];

            // running 状態を発行
            emit({
              type: EventType.ACTIVITY_SNAPSHOT,
              messageId: activityId,
              activityType: "workflow-step",
              content: {
                workflowName,
                stepName: step.name,
                stepIndex: i,
                totalSteps,
                status: "running" as const,
              },
            } as BaseEvent);

            await sleep(step.durationMs);
          }

          // 全ステップ完了 → completed を発行してカードを非表示にする
          emit({
            type: EventType.ACTIVITY_SNAPSHOT,
            messageId: activityId,
            activityType: "workflow-step",
            content: {
              workflowName,
              stepName: "",
              stepIndex: totalSteps - 1,
              totalSteps,
              status: "completed" as const,
            },
          } as BaseEvent);

          // Text response
          await sleep(300);
          const msgId = `msg-${Date.now()}`;
          emit({
            type: EventType.TEXT_MESSAGE_START,
            messageId: msgId,
            role: "assistant",
          } as BaseEvent);

          const responseText = `Workflow "${workflowName}" completed. All ${totalSteps} steps finished successfully for "${topic}".`;

          for (const char of responseText) {
            emit({
              type: EventType.TEXT_MESSAGE_CONTENT,
              messageId: msgId,
              delta: char,
            } as BaseEvent);
            await sleep(12);
          }

          emit({ type: EventType.TEXT_MESSAGE_END, messageId: msgId } as BaseEvent);
          emit({ type: EventType.RUN_FINISHED } as BaseEvent);
          subscriber.complete();
        } catch (err) {
          subscriber.error(err);
        }
      })();
    });
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
