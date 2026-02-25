# CopilotKit v2 ActivityEvent

## 概要

ActivityEvent は AG-UI プロトコルの `ACTIVITY_SNAPSHOT` / `ACTIVITY_DELTA` イベントを通じて、エージェントの中間状態（検索中、処理中、ワークフロー進捗など）をリッチなカスタムUIとしてチャット内に表示する仕組み。

テキストメッセージ (`role: "assistant"`) やツールコール (`role: "tool"`) とは異なる、**第3のメッセージタイプ** (`role: "activity"`)。

## AG-UI EventType 一覧

| カテゴリ | イベント |
|---|---|
| Run制御 | `RUN_STARTED`, `RUN_FINISHED`, `RUN_ERROR` |
| Step制御 | `STEP_STARTED`, `STEP_FINISHED` |
| テキストメッセージ | `TEXT_MESSAGE_START`, `TEXT_MESSAGE_CONTENT`, `TEXT_MESSAGE_END`, `TEXT_MESSAGE_CHUNK` |
| ツールコール | `TOOL_CALL_START`, `TOOL_CALL_ARGS`, `TOOL_CALL_END`, `TOOL_CALL_CHUNK`, `TOOL_CALL_RESULT` |
| 思考 (Thinking) | `THINKING_START`, `THINKING_END`, `THINKING_TEXT_MESSAGE_*` |
| 推論 (Reasoning) | `REASONING_START`, `REASONING_MESSAGE_*`, `REASONING_END`, `REASONING_ENCRYPTED_VALUE` |
| 状態 | `STATE_SNAPSHOT`, `STATE_DELTA`, `MESSAGES_SNAPSHOT` |
| **Activity** | **`ACTIVITY_SNAPSHOT`**, **`ACTIVITY_DELTA`** |
| その他 | `RAW`, `CUSTOM` |

## ACTIVITY_SNAPSHOT イベント

content 全体をスナップショットとして置換する。

```typescript
{
  type: "ACTIVITY_SNAPSHOT";
  messageId: string;              // ActivityMessage の ID（同じIDで上書き更新）
  activityType: string;           // レンダラーとのマッチングキー
  content: Record<string, any>;   // 任意のペイロード
  replace?: boolean;              // デフォルト true（スナップショット全置換）
  timestamp?: number;
}
```

## ACTIVITY_DELTA イベント

JSON Patch で content を差分更新する。大きなペイロードの部分更新に有効。

```typescript
{
  type: "ACTIVITY_DELTA";
  messageId: string;
  activityType: string;
  patch: any[];    // JSON Patch 操作の配列
  timestamp?: number;
}
```

## ACTIVITY_SNAPSHOT → ActivityMessage の対応

```
AG-UI イベント                       CopilotKit メッセージモデル
─────────────                       ──────────────────────────
ACTIVITY_SNAPSHOT                   ActivityMessage
  ├ messageId ──────────────────→     id: string
  ├ activityType ───────────────→     activityType: string
  └ content ────────────────────→     content: Record<string, any>
                                      role: "activity"  (固定)
```

- `ACTIVITY_SNAPSHOT` を受信すると、CopilotKit は `messageId` で既存の `ActivityMessage` を探す
- **存在しなければ新規作成**、**存在すれば content を上書き**（同じカードがインプレース更新される）
- 同じ `messageId` を使い続けることで、1つのカードを逐次更新できる

## フロントエンド: ReactActivityMessageRenderer

`CopilotKitProvider` の `renderActivityMessages` prop にレンダラー配列を渡す。

```typescript
interface ReactActivityMessageRenderer<TActivityContent> {
  activityType: string;                    // マッチングキー（"*" でワイルドカード）
  agentId?: string;                        // 特定エージェントにスコープ（省略可）
  content: z.ZodSchema<TActivityContent>;  // Zod スキーマでバリデーション
  render: React.ComponentType<{
    activityType: string;
    content: TActivityContent;
    message: ActivityMessage;
    agent: AbstractAgent | undefined;
  }>;
}
```

### レンダラーのマッチング優先順位

1. `activityType` + `agentId` が完全一致
2. `activityType` が一致し `agentId` 未指定
3. `activityType: "*"` のワイルドカード

### 使用例

```tsx
import { CopilotKitProvider } from "@copilotkitnext/react";
import type { ReactActivityMessageRenderer } from "@copilotkitnext/react";
import { z } from "zod";

const workflowRenderer: ReactActivityMessageRenderer<{
  stepName: string;
  status: string;
}> = {
  activityType: "workflow-step",
  content: z.object({
    stepName: z.string(),
    status: z.string(),
  }),
  render: ({ content }) => {
    if (content.status === "completed") return null; // 非表示
    return <div>Running: {content.stepName}</div>;
  },
};

<CopilotKitProvider
  runtimeUrl="/api/copilotkit"
  renderActivityMessages={[workflowRenderer]}
>
  <CopilotChat />
</CopilotKitProvider>
```

## 典型的なイベントフロー

```
RUN_STARTED
│
├─ ACTIVITY_SNAPSHOT (messageId: "wf-1", activityType: "workflow-step")
│    content: { stepName: "Fetch Data", status: "running" }
│    → ActivityMessage 新規作成、レンダラーがカード表示
│
├─ ACTIVITY_SNAPSHOT (messageId: "wf-1", activityType: "workflow-step")
│    content: { stepName: "Validate", status: "running" }
│    → 同じ ActivityMessage を上書き、カードの UI が更新
│
├─ ACTIVITY_SNAPSHOT (messageId: "wf-1", activityType: "workflow-step")
│    content: { stepName: "", status: "completed" }
│    → レンダラーが null 返却 → カード非表示
│
├─ TEXT_MESSAGE_START  (messageId: "msg-1")
├─ TEXT_MESSAGE_CONTENT (messageId: "msg-1", delta: "Done!")
├─ TEXT_MESSAGE_END    (messageId: "msg-1")
│
RUN_FINISHED
```

## パッケージ情報

| パッケージ | バージョン (next tag) | 用途 |
|---|---|---|
| `@copilotkitnext/react` | 1.52.0-next.8 | CopilotKitProvider, CopilotChat, hooks |
| `@copilotkitnext/runtime` | 1.52.0-next.8 | CopilotRuntime (サーバー側) |
| `@copilotkitnext/agent` | 1.52.0-next.8 | BuiltInAgent |
| `@ag-ui/client` | 0.0.45 | AbstractAgent, EventType |
| `@ag-ui/core` | 0.0.45 | ActivityMessage, ActivitySnapshotEvent 等の型定義 |

## ソースコード参照

CopilotKit リポジトリ内の関連ファイル:

- 型定義: `packages/v2/react/src/types/react-activity-message-renderer.ts`
- Hook: `packages/v2/react/src/hooks/use-render-activity-message.tsx`
- Provider: `packages/v2/react/src/providers/CopilotKitProvider.tsx` (renderActivityMessages prop)
- テスト: `packages/v2/react/src/components/chat/__tests__/CopilotChatActivityRendering.e2e.test.tsx`
