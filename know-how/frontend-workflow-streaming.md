## ✅ フロントエンドから直接 Workflow をストリーミング呼び出し【成功】

### 実装方法
フロントエンドのCopilotKitアクションから、Workflowを呼び出してリアルタイムでイベントをストリーミング表示する。

#### 1. Workflowの定義とwriter.write()の使用

```typescript
// src/mastra/workflows/test-workflow.ts
import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";

export const step1 = createStep({
  id: "step1",
  inputSchema: z.object({ value: z.string() }),
  outputSchema: z.object({ result: z.string() }),
  execute: async ({ inputData, writer }) => {
    // ⭐ writer.write() でカスタムイベントを送信（必ずawait）
    await writer?.write({
      type: "step-progress",
      message: "step1を開始しました",
    });

    const result = `Step1: ${inputData.value}`;
    return { result };
  },
});

export const step2 = createStep({
  id: "step2",
  inputSchema: z.object({ result: z.string() }),
  outputSchema: z.object({ finalResult: z.string() }),
  execute: async ({ inputData, writer }) => {
    const finalResult = `${inputData.result} -> Step2完了`;

    // ⭐ ステップ終了時にも通知
    await writer?.write({
      type: "step-progress",
      message: "step2を終了しました",
    });

    return { finalResult };
  },
});

export const testWorkflow = createWorkflow({
  name: "testWorkflow",
  inputSchema: z.object({ value: z.string() }),
  outputSchema: z.object({ finalResult: z.string() }),
})
  .step(step1)
  .step(step2)
  .commit();
```

#### 2. API Route の分離とWorkflowストリーミング

**ディレクトリ構造:**
```
/src/app/api/mastra/
├── agents/[...path]/route.ts      # Agent専用
└── workflows/[...path]/route.ts   # Workflow専用
```

**Workflow APIルート:**
```typescript
// src/app/api/mastra/workflows/[...path]/route.ts
export async function POST(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const adjustedPath = path[0] === 'api' ? path.slice(1) : path;

  // /api/mastra/workflows/{workflowName}/stream
  if (adjustedPath.length === 2 && adjustedPath[1] === "stream") {
    const workflowName = adjustedPath[0];
    const body = await req.json();

    const workflow = mastra.getWorkflow(workflowName);
    const run = await workflow.createRunAsync();

    // ⭐ streamVNext() を使用してストリーミング
    const stream = run.streamVNext({
      inputData: body.inputData,
    });

    // ⭐ ChunkTypeイベントをSSE形式に変換
    const encoder = new TextEncoder();
    const sseStream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            const sseChunk = `data: ${JSON.stringify(chunk)}\n\n`;
            controller.enqueue(encoder.encode(sseChunk));
          }
          controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
        } finally {
          controller.close();
        }
      }
    });

    return new Response(sseStream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  }
}
```

#### 3. フロントエンドでのWorkflow呼び出し

```typescript
// src/app/page.tsx
const [workflowStates, setWorkflowStates] = useState<Record<string, { events: string[]; isStreaming: boolean }>>({});

useCopilotAction({
  name: "callWorkflowDirectly",
  description: "testWorkflowを直接呼び出してストリーミング表示する",
  parameters: [
    {
      name: "value",
      description: "Workflowに渡す初期値",
      type: "string",
      required: true,
    },
  ],
  render: ({ args, status, result, actionExecutionId }) => {
    const workflowState = workflowStates[actionExecutionId] || { events: [], isStreaming: false };

    if (status === "executing" || status === "complete" || workflowState.isStreaming || workflowState.events.length > 0) {
      return (
        <div>
          <div>🔄 Workflowからの応答</div>
          <div>入力値: {args.value}</div>
          <div>
            {workflowState.events.map((event, idx) => (
              <div key={idx}>{event}</div>
            ))}
          </div>
        </div>
      );
    }
    return null;
  },
  handler: async ({ value, actionExecutionId }) => {
    // ⭐ 直接fetchでWorkflow APIを呼び出し
    const response = await fetch(`${window.location.origin}/api/mastra/workflows/testWorkflow/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inputData: { value } }),
    });

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    const events: string[] = [];

    while (true) {
      const { done, value: chunk } = await reader.read();
      if (done) break;

      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split("\n\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = line.slice(6);
          if (data === "[DONE]") continue;

          const eventData = JSON.parse(data);

          // ⭐ イベントタイプに応じて表示を整形
          let displayText = "";
          if (eventData.type === "workflow-start") {
            displayText = "🚀 Workflow開始";
          } else if (eventData.type === "workflow-step-start") {
            displayText = `▶️ ${eventData.payload?.stepName}開始`;
          } else if (eventData.type === "step-progress") {
            // ⭐ writer.write()のカスタムイベント
            displayText = `📝 ${eventData.message}`;
          } else if (eventData.type === "workflow-step-result") {
            displayText = `✅ ${eventData.payload?.stepName}完了`;
          } else if (eventData.type === "workflow-finish") {
            displayText = "🏁 Workflow完了";
          }

          events.push(displayText);
          setWorkflowStates(prev => ({
            ...prev,
            [actionExecutionId]: { events: [...events], isStreaming: true }
          }));
        }
      }
    }

    return `Workflow完了: ${events.length}個のイベント`;
  },
});
```

### 結果
- ✅ Workflowのリアルタイムストリーミング実行
- ✅ `writer.write()` のカスタムイベントを表示
- ✅ Workflowライフサイクルイベントを表示（start, step-start, step-result, finish）
- ✅ 複数回実行しても独立したステート管理
- ✅ AgentとWorkflowでAPIルートを分離

### 学び

#### Workflowストリーミングの重要ポイント

1. **`run.streamVNext()` を使用**
   - `run.stream()` より新しいAPI
   - `MastraWorkflowStream` を返す（`ReadableStream<ChunkType>` を継承）
   - `for await (const chunk of stream)` で直接反復可能

2. **writer.write() は必ずawait**
   ```typescript
   await writer?.write({ ... }); // ✅ 正しい
   writer?.write({ ... });        // ❌ ストリームがロックされる
   ```

3. **ChunkTypeイベントの構造**
   - Workflowライフサイクルイベント: `workflow-start`, `workflow-step-start`, `workflow-step-result`, `workflow-finish`
   - カスタムイベント: `writer.write()` で送信した任意の型
   - すべて `{ type, payload, runId, from }` 構造

4. **SSE変換が必要**
   - `streamVNext()` は生のJavaScriptオブジェクトを返す
   - Agentと同様にSSE形式（`data: {json}\n\n`）に変換が必要

5. **APIルートの分離**
   - `/api/mastra/agents/[...path]/` - Agent専用
   - `/api/mastra/workflows/[...path]/` - Workflow専用
   - 責務が明確になり、拡張しやすい

#### よくある間違い

1. ❌ `writer.write()` を await しない → ストリームがロック
2. ❌ MastraClient を使おうとする → WorkflowはMastraClient未対応、直接fetchを使う
3. ❌ `run.stream()` を使う → `run.streamVNext()` を使うべき
4. ❌ SSE形式に変換しない → クライアント側でパースできない

#### Workflowストリーミングの利点

- **進捗の可視化**: 各ステップの開始・完了がリアルタイムで分かる
- **カスタムイベント**: `writer.write()` で任意の情報を送信可能
- **デバッグが容易**: 各ステップの実行状況をUIで確認できる
- **UX向上**: 長時間実行するWorkflowでもユーザーに進捗を表示できる

---

