# Mastra Workflow Stream → CopilotKit ActivityEvent マッピング

## Mastra Workflow Stream Events

Mastra の workflow `.stream()` が発行するイベント一覧。
各イベントは `{ type, runId, from: "WORKFLOW", payload }` の構造を持つ。

| event.type | payload | 用途 |
|---|---|---|
| `workflow-start` | `{ workflowId }` | ワークフロー開始 |
| `workflow-step-start` | `{ id, stepCallId, status, output?, payload? }` | ステップ開始 |
| `workflow-step-result` | `{ id, stepCallId, status, output?, payload?, tripwire? }` | ステップ完了(結果あり) |
| `workflow-step-finish` | `{ id, metadata }` | ステップ最終化 |
| `workflow-step-progress` | `{ id, completedCount, totalCount, currentIndex, iterationStatus, iterationOutput? }` | foreach 進捗 |
| `workflow-step-suspended` | `{ id, status, output?, suspendPayload? }` | ステップ一時停止 |
| `workflow-step-waiting` | `{ id, payload, startedAt, status }` | sleep 等の待機 |
| `workflow-step-output` | `StepOutputPayload` | カスタム出力 |
| `workflow-finish` | `{ workflowStatus, output, metadata }` | ワークフロー完了 |
| `workflow-canceled` | `{}` | キャンセル |
| `workflow-paused` | `{}` | 一時停止 |

## マッピング方針

### 方針 A: 単一 activityType + 同一 messageId（推奨）

1つの `activityType: "mastra-workflow"` と固定の `messageId` で、1つのカードをインプレース更新する。

```
workflow-start        → ACTIVITY_SNAPSHOT  status: "started"
workflow-step-start   → ACTIVITY_SNAPSHOT  status: "running",  stepStatus: "running"
workflow-step-result  → ACTIVITY_SNAPSHOT  status: "running",  stepStatus: "completed"
workflow-step-finish  →  (無視 or ログのみ)
workflow-finish       → ACTIVITY_SNAPSHOT  status: "completed"
```

利点:
- チャットに表示されるカードは常に1つ
- レンダラーも1つで済む
- ステップ切り替え時にスライドアニメーション等の演出が可能

### 方針 B: event.type をそのまま activityType にマップ

各 Mastra イベントを個別の `activityType` として発行し、ステップごとに別の `messageId` を使う。

利点:
- イベント種別ごとに異なるレンダラーを割り当てられる
- 全ステップの履歴がチャットに残る

欠点:
- チャットにカードが大量に並ぶ
- レンダラーをイベント種別分だけ用意する必要がある

## 実装例（方針 A）

### Agent 側: Mastra stream → ACTIVITY_SNAPSHOT 変換

```typescript
import { EventType, type BaseEvent } from "@ag-ui/client";

async function emitWorkflowEvents(
  workflow: MastraWorkflow,
  input: Record<string, unknown>,
  emit: (event: BaseEvent) => void,
) {
  const run = workflow.createRun();
  const messageId = `workflow-${run.runId}`;

  for await (const event of run.stream(input)) {
    switch (event.type) {
      case "workflow-start":
        emit({
          type: EventType.ACTIVITY_SNAPSHOT,
          messageId,
          activityType: "mastra-workflow",
          content: {
            workflowId: event.payload.workflowId,
            status: "started",
          },
        } as BaseEvent);
        break;

      case "workflow-step-start":
        emit({
          type: EventType.ACTIVITY_SNAPSHOT,
          messageId,
          activityType: "mastra-workflow",
          content: {
            workflowId: event.payload.workflowId,
            currentStepId: event.payload.id,
            stepStatus: "running",
            status: "running",
          },
        } as BaseEvent);
        break;

      case "workflow-step-result":
        emit({
          type: EventType.ACTIVITY_SNAPSHOT,
          messageId,
          activityType: "mastra-workflow",
          content: {
            workflowId: event.payload.workflowId,
            currentStepId: event.payload.id,
            stepStatus: "completed",
            output: event.payload.output,
            status: "running",
          },
        } as BaseEvent);
        break;

      case "workflow-step-progress":
        emit({
          type: EventType.ACTIVITY_SNAPSHOT,
          messageId,
          activityType: "mastra-workflow",
          content: {
            workflowId: event.payload.workflowId,
            currentStepId: event.payload.id,
            stepStatus: "progress",
            completedCount: event.payload.completedCount,
            totalCount: event.payload.totalCount,
            status: "running",
          },
        } as BaseEvent);
        break;

      case "workflow-step-suspended":
        emit({
          type: EventType.ACTIVITY_SNAPSHOT,
          messageId,
          activityType: "mastra-workflow",
          content: {
            currentStepId: event.payload.id,
            stepStatus: "suspended",
            status: "paused",
          },
        } as BaseEvent);
        break;

      case "workflow-finish":
        emit({
          type: EventType.ACTIVITY_SNAPSHOT,
          messageId,
          activityType: "mastra-workflow",
          content: {
            status: "completed",
            workflowStatus: event.payload.workflowStatus,
          },
        } as BaseEvent);
        break;

      case "workflow-canceled":
        emit({
          type: EventType.ACTIVITY_SNAPSHOT,
          messageId,
          activityType: "mastra-workflow",
          content: { status: "canceled" },
        } as BaseEvent);
        break;
    }
  }
}
```

### フロントエンド: レンダラー

```tsx
import type { ReactActivityMessageRenderer } from "@copilotkitnext/react";
import { z } from "zod";

const mastraWorkflowRenderer: ReactActivityMessageRenderer<{
  status: string;
  currentStepId?: string;
  stepStatus?: string;
  output?: Record<string, unknown>;
  completedCount?: number;
  totalCount?: number;
}> = {
  activityType: "mastra-workflow",
  content: z.object({
    status: z.string(),
    currentStepId: z.string().optional(),
    stepStatus: z.string().optional(),
    output: z.record(z.unknown()).optional(),
    completedCount: z.number().optional(),
    totalCount: z.number().optional(),
  }),
  render: ({ content }) => {
    if (content.status === "completed" || content.status === "canceled") {
      return null; // カード非表示
    }

    return (
      <div>
        <span>{content.currentStepId}</span>
        <span>{content.stepStatus}</span>
        {content.stepStatus === "progress" && (
          <span>{content.completedCount}/{content.totalCount}</span>
        )}
      </div>
    );
  },
};

// CopilotKitProvider に渡す
<CopilotKitProvider renderActivityMessages={[mastraWorkflowRenderer]}>
```

## Mastra イベント → content フィールド対応表

| Mastra event.type | content.status | content.stepStatus | 備考 |
|---|---|---|---|
| `workflow-start` | `"started"` | - | |
| `workflow-step-start` | `"running"` | `"running"` | currentStepId あり |
| `workflow-step-result` | `"running"` | `"completed"` | output あり |
| `workflow-step-progress` | `"running"` | `"progress"` | completedCount/totalCount あり |
| `workflow-step-suspended` | `"paused"` | `"suspended"` | |
| `workflow-step-waiting` | `"running"` | `"waiting"` | |
| `workflow-finish` | `"completed"` | - | レンダラーが null 返却 |
| `workflow-canceled` | `"canceled"` | - | レンダラーが null 返却 |
| `workflow-paused` | `"paused"` | - | |
