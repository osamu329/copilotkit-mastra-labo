# Mastra + CopilotKit 開発ノウハウ

## Sub-Agent とのやり取りを可視化する試行錯誤

### 目的
Mastra の sub-agent（サブエージェント）とのやり取りをフロントエンドで表示したい。

### 試したこと

#### 1. `writer.write()` でカスタムメッセージを送信 ❌

**実装方法:**
```typescript
execute: async ({ context, mastra, writer }) => {
  if (writer) {
    await writer.write({
      type: 'sub-agent-start',
      message: `🤖 subAgentを呼び出しています...\n質問: ${context.message}`,
    });
  }
  const response = await agent.generate(context.message);
  if (writer) {
    await writer.write({
      type: 'sub-agent-response',
      message: `\n✅ subAgentからの回答:\n${responseText}`,
    });
  }
}
```

**結果:**
- ❌ UI上に表示されない
- Mastra 側では `writer.write()` が実行されている（ログで確認）
- CopilotKit が Mastra の `writer` からのカスタムイベントを認識・表示しない

**学び:**
- `writer.write()` は Mastra のドキュメントに記載されているが、CopilotKit との統合では機能しない
- カスタムイベントタイプ（`'sub-agent-start'` など）は表示されない

---

#### 2. `stream.textStream.pipeTo(writer)` でストリーミング ⚠️

**実装方法:**
```typescript
execute: async ({ context, mastra, writer }) => {
  if (writer) {
    const stream = await agent.stream(context.message);
    await stream!.textStream.pipeTo(writer);
    return {
      response: await stream!.text,
    };
  }
}
```

**結果:**
- ⚠️ ツールの実行は成功するが、UI上でストリーミングは表示されない
- ログで確認:
  ```
  🔧 callSubAgentTool called with writer: true
  📡 Starting subAgent stream...
  ⏳ Piping stream to writer...
  ✅ Stream completed: こんにちは！...
  ```
- 親エージェント（weatherAgent）がツールの結果を受け取り、それを解釈して出力する

**学び:**
- `pipeTo(writer)` は Mastra のドキュメント通りに動作している
- しかし、CopilotKit のチャット UI では、ツールのストリーム出力は直接表示されない
- 親エージェントの `instructions` によって、ツールの結果が要約・解釈されてしまう

---

#### 3. `useCopilotAction` の `render` で可視化 ✅

**実装方法:**
```typescript
useCopilotAction({
  name: "call-sub-agent",
  description: "Call the sub agent",
  available: "disabled",
  parameters: [{ name: "message", type: "string", required: true }],
  render: ({ args, status, result }) => {
    return (
      <div>
        <div>質問: {args.message}</div>
        {status === "executing" && <div>⏳ subAgentが考えています...</div>}
        {status === "complete" && result && <div>回答: {result.response}</div>}
      </div>
    );
  },
});
```

**結果:**
- ✅ ツールの実行状態（executing/complete）を可視化できる
- ✅ 質問と回答を明示的に表示できる
- ⚠️ ただし、文字単位のリアルタイムストリーミングは表示されない
- `status` と `result` のみで、中間のテキストストリームは受け取れない

**学び:**
- CopilotKit でツールの実行を可視化するには `useCopilotAction` の `render` を使う
- `render` は `args`（パラメータ）、`status`（実行状態）、`result`（最終結果）を受け取る
- Mastra のツールストリーミング（`pipeTo`）と CopilotKit の `render` は直接連携しない

---

## まとめ

### 動作する方法
- **CopilotKit の `useCopilotAction` + `render`** を使う
- ツールの実行前（executing）と完了後（complete）の2段階で UI を更新できる

### 動作しない方法
- Mastra の `writer.write()` でカスタムメッセージ送信
- Mastra の `stream.textStream.pipeTo(writer)` によるリアルタイムストリーミング表示

### 技術的な原因（推測）
1. CopilotKit は Mastra の `ToolStream` からのカスタムイベントをサポートしていない
2. CopilotKit の UI レイヤーは、ツールの最終結果のみを受け取る設計
3. AG-UI プロトコル経由でのストリーミングイベントが、CopilotKit の React UI まで伝播していない

### 今後の改善可能性
- CopilotKit の新しいバージョンで Mastra のツールストリーミングをサポートする可能性
- AG-UI プロトコルの統合が進めば、リアルタイムストリーミングが表示される可能性
- カスタム UI レイヤーを実装すれば、Mastra のストリームイベントを直接購読できる可能性

---

## Sub-Agent の設定に関する学び

### `description` プロパティが必須
Sub-agent を親エージェントから認識させるには、`description` プロパティが必須:

```typescript
export const subAgent = new Agent({
  name: "Sub Agent",
  description: "現在の時刻を確認して適切な挨拶を日本語で返すエージェント", // 必須！
  model: anthropic("claude-haiku-4-5"),
  instructions: "...",
});
```

- `description` がないと、親エージェントが sub-agent を適切にルーティングできない
- `description` は親エージェントが「どの sub-agent を使うべきか」を判断する材料になる

### `.network()` メソッドの使用
Sub-agent を呼び出すには、通常の `.generate()` ではなく `.network()` を使う:

```typescript
// ❌ これでは sub-agent は呼び出されない
const response = await weatherAgent.generate("こんにちは");

// ✅ これで sub-agent がルーティングされる
const response = await weatherAgent.network("subAgentと会話してください");
```

### Mastra インスタンスへの登録
Sub-agent をフロントエンドから直接アクセスしたい場合は、Mastra インスタンスに登録する:

```typescript
export const mastra = new Mastra({
  agents: {
    weatherAgent,
    subAgent  // これで CopilotKit からアクセス可能
  },
});
```

- `MastraAgent.getLocalAgents({ mastra })` が自動的に全エージェントを CopilotKit に公開
- フロントエンドで `useCoAgent({ name: "Sub Agent" })` でアクセス可能

### Tool 経由での呼び出し
Sub-agent を tool として呼び出す場合の注意点:

```typescript
execute: async ({ context, mastra, writer }) => {
  // mastra.getAgent() を使う場合、エージェントのキー名に注意
  const agent = mastra?.getAgent('subAgent');  // ✅ キー名は 'subAgent'
  // const agent = mastra?.getAgent('Sub Agent');  // ❌ name プロパティではない
}
```

- `mastra.getAgent()` の引数は、Mastra インスタンスに登録した**キー名**
- エージェントの `name` プロパティではない
- エラーメッセージ `agents: 'weatherAgent, subAgent'` から正しいキー名を確認できる

---

## Anthropic API のタイムアウトエラー

### 発生したエラー
```
Error [AI_APICallError]: Cannot connect to API:
  url: 'https://api.anthropic.com/v1/messages',
  code: 'ETIMEDOUT'
```

### 原因
- ネットワーク接続の一時的な問題
- Anthropic API へのリクエストがタイムアウト
- 同時リクエストが多い場合に発生する可能性

### 対処法
- 一時的なエラーの場合、リトライすると成功する
- 本番環境では適切なタイムアウト設定とリトライロジックを実装する
- API キーとネットワーク接続を確認する

---

## CopilotKit の設定

### サイドバーを最初から開く
```typescript
<CopilotSidebar
  defaultOpen={true}  // この行を追加
  disableSystemMessage={true}
  clickOutsideToClose={false}
  // ...
>
```

### Suggestion の追加
```typescript
suggestions={[
  {
    title: "Call Sub Agent",
    message: "サブエージェントを呼び出して",
  },
]}
```

---

---

## ✅ フロントエンドから直接 Sub-Agent をストリーミング呼び出し【成功】

### 実装方法
フロントエンドのCopilotKitアクションから、MastraClientを使って直接sub-agentを呼び出し、リアルタイムストリーミング表示する。

#### 1. API Route でSSE形式のストリームを返す

**重要**: MastraClientの`processDataStream()`は**SSE (Server-Sent Events)** 形式を期待しており、各チャンクは `ChunkType` オブジェクト（`{ type, payload, runId, from }`）である必要がある。

```typescript
// src/app/api/mastra/[...path]/route.ts
export async function POST(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const adjustedPath = path[0] === 'api' ? path.slice(1) : path;

  if (adjustedPath[0] === "agents" && adjustedPath[2] === "stream") {
    const agentName = adjustedPath[1];
    const body = await req.json();

    const agent = mastra.getAgent(agentName);
    const streamResult = await agent.stream(body.messages);

    // ⭐ fullStream を SSE 形式に変換
    const encoder = new TextEncoder();
    const sseStream = new ReadableStream({
      async start(controller) {
        try {
          const reader = streamResult.fullStream.getReader();

          while (true) {
            const { done, value } = await reader.read();

            if (done) {
              controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
              break;
            }

            // SSE形式: data: {json}\n\n
            const sseChunk = `data: ${JSON.stringify(value)}\n\n`;
            controller.enqueue(encoder.encode(sseChunk));
          }
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

**ポイント:**
- ❌ `textStream` ではなく ✅ `fullStream` を使う
- ❌ `new Response(stream.textStream)` ではなく ✅ SSE形式に変換
- 各チャンクを `data: {json}\n\n` 形式でエンコード
- ストリーム終了時に `data: [DONE]\n\n` を送信
- 適切なヘッダー（`Content-Type: text/event-stream`）を設定

#### 2. フロントエンドで MastraClient を使ってストリーミング受信

```typescript
// src/app/page.tsx
import { MastraClient } from '@mastra/client-js';

const [streamingStates, setStreamingStates] = useState<Record<string, { text: string; isStreaming: boolean }>>({});

useCopilotAction({
  name: "callSubAgentDirectly",
  description: "時刻に応じた適切な挨拶を直接subAgentに聞く（フロントエンドから）",
  parameters: [
    {
      name: "message",
      description: "subAgentに送るメッセージ",
      type: "string",
      required: true,
    },
  ],
  render: ({ args, status, result, actionExecutionId }) => {
    const callState = streamingStates[actionExecutionId] || { text: "", isStreaming: false };

    if (status === "executing" || status === "complete" || callState.isStreaming || callState.text) {
      const displayText = status === "complete" && result
        ? result
        : (callState.text || "⏳ 考えています...");

      return (
        <div style={{...}}>
          <div>🤖 subAgentからの応答</div>
          <div>質問: {args.message}</div>
          <div>{displayText}</div>
        </div>
      );
    }
    return null;
  },
  handler: async ({ message, actionExecutionId }) => {
    try {
      setStreamingStates(prev => ({
        ...prev,
        [actionExecutionId]: { text: "", isStreaming: true }
      }));

      const mastraClient = new MastraClient({
        baseUrl: `${window.location.origin}/api/mastra`,
      });

      const agent = mastraClient.getAgent("subAgent");
      const stream = await agent.stream({
        messages: [{ role: "user", content: message }],
      });

      let fullText = "";

      // ⭐ processDataStream で onChunk コールバックを使う
      await stream.processDataStream({
        onChunk: async (chunk) => {
          if (chunk.type === 'text-delta') {
            fullText += chunk.payload.text;
            setStreamingStates(prev => ({
              ...prev,
              [actionExecutionId]: { text: fullText, isStreaming: true }
            }));
          }
        },
      });

      setStreamingStates(prev => ({
        ...prev,
        [actionExecutionId]: { text: fullText, isStreaming: false }
      }));

      return fullText;
    } catch (error) {
      console.error("Error calling subAgent:", error);
      return "エラーが発生しました";
    }
  },
});
```

**ポイント:**
- ❌ `onTextPart` ではなく ✅ `onChunk` コールバックを使う
- `chunk.type === 'text-delta'` でテキストチャンクをフィルタ
- `chunk.payload.text` からテキストを取得
- `actionExecutionId` を使って各呼び出しごとに独立したステート管理
- `render` で `status === "complete" && result` の場合は最終結果を表示

#### 3. MastraClient の baseUrl 設定の注意点

MastraClientは内部的に `/api/` を追加するため、API routeでパスを調整する必要がある：

```typescript
// API route
const { path } = await params;
// MastraClient が /api/mastra/api/agents/... のように送信する
const adjustedPath = path[0] === 'api' ? path.slice(1) : path;
```

### 結果
- ✅ リアルタイムストリーミング表示が可能
- ✅ 複数回呼び出しても独立したステート管理
- ✅ 完了後も応答が画面に残る
- ⚠️ デバッグログが多いとややラグがある（本番ではログを削除すべき）

### 学び

#### SSE形式の重要性
- MastraClientの`processDataStream()`は、生のテキストストリームではなく、**SSE形式のChunkTypeオブジェクト**を期待している
- `textStream`を直接返すと、クライアント側でパースできずに`onChunk`が呼ばれない
- `fullStream`を使ってチャンク構造を保持する必要がある

#### ChunkType の構造
```typescript
type ChunkType = {
  type: 'text-delta' | 'tool-call' | 'tool-result' | 'finish' | ...;
  payload: {
    text?: string;      // type === 'text-delta' の場合
    // その他のペイロード
  };
  runId: string;
  from: 'AGENT' | 'TOOL';
}
```

#### よくある間違い
1. ❌ `stream.textStream` をそのまま返す → クライアント側でパースできない
2. ❌ `onTextPart` コールバックを使う → `onChunk` が正しい
3. ❌ 単一のステート変数を使う → 複数呼び出しで上書きされる
4. ❌ `baseUrl` を `/api/mastra/agents` にする → MastraClientが `/api/` を追加するため二重になる

---

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

## 参考リンク

### Mastra ドキュメント
- Tool Streaming: https://github.com/mastra-ai/mastra/blob/main/docs/src/content/en/docs/streaming/tool-streaming.mdx
- Agent Networks: https://github.com/mastra-ai/mastra/blob/main/docs/src/content/en/docs/agents/networks.mdx
- Workflow Streaming: https://github.com/mastra-ai/mastra/blob/main/docs/src/content/en/docs/streaming/workflow-streaming.mdx

### CopilotKit ドキュメント
- useCopilotAction: https://docs.copilotkit.ai/reference/hooks/useCopilotAction
- Generative UI: https://docs.copilotkit.ai/concepts/generative-ui

---

## 🎨 Generative UI の深掘り調査

### Generative UI とは

**定義**: AIエージェントが直接Reactコンポーネントを生成・レンダリングできる仕組み

従来のチャットUIでは単純なテキスト応答のみだったが、Generative UIを使うと、AIが指示した時点で複雑なカスタムUIが自動的に表示される。

**特徴**:
- AIエージェントがツール呼び出し時にUIを自動レンダリング
- ストリーミング対応で即座にUI更新
- ユーザーインタラクション（承認/キャンセル）をAIにフィードバック可能
- ツールの実行ステータス（executing → complete）に応じてUI更新

---

### 実装方法の全体像

CopilotKitには5つのGenerative UI実装方法がある：

| 方法 | 用途 | Handler | Render | 特徴 |
|------|------|---------|--------|------|
| `useCopilotAction` | 基本ツールUI | ○ | ○ | 最もシンプル |
| `renderAndWaitForResponse` | ユーザー入力待ち | × | ○ | `respond()`でAIに返答 |
| `useFrontendTool` | 非同期処理+UI | ○ | ○ | 完全なライフサイクル |
| `useCoAgentStateRender` | **リアルタイムストリーミング** | × | ○ | Backend状態監視 |
| `useRenderToolCall` | レンダリング専用 | × | ○ | Backend Actionと連携 |

---

### リアルタイムストリーミングUI実装の問題

#### 問題の本質

**現象**: Workflowのストリーミングイベントを `render` 関数で表示しようとしたが、リアルタイム更新されない

**試したアプローチ**:

1. **`useState` + `render` 関数**
   ```typescript
   const [events, setEvents] = useState([]);

   useCopilotAction({
     render: () => {
       return <div>{events.map(e => <div>{e}</div>)}</div>;
     },
     handler: async () => {
       // while ループ内で setEvents を呼ぶ
       for (const event of workflowEvents) {
         setEvents(prev => [...prev, event]); // ❌ 反映されない
       }
     }
   });
   ```
   **結果**: ❌ 再レンダリングされない
   **原因**: `render` 関数は `status` や `args` が変わらないと再実行されない

2. **`flushSync` で強制更新**
   ```typescript
   import { flushSync } from "react-dom";

   for (const event of workflowEvents) {
     flushSync(() => {
       setEvents(prev => [...prev, event]); // ❌ それでも反映されない
     });
   }
   ```
   **結果**: ❌ 効果なし
   **原因**: 同期ループ内でReactの再レンダリングがブロックされる

3. **`appendMessage` でチャットメッセージとして追加**
   ```typescript
   const { appendMessage } = useCopilotChat();

   for (const event of workflowEvents) {
     await appendMessage(
       new TextMessage({
         role: MessageRole.Assistant,
         content: event,
       })
     );
     await new Promise(resolve => setTimeout(resolve, 0)); // イベントループに制御を戻す
   }
   ```
   **結果**: ✅ リアルタイム表示される
   **制限**: 見た目のカスタマイズ不可（Markdownのみ）

#### 根本原因

**`render` 関数の再レンダリングトリガー**:
- `status` プロパティの変化
- `args` プロパティの変化
- `result` プロパティの変化

**問題点**:
- handler内の同期ループ中はこれらの値が変わらない
- 外部の `useState` を更新しても `render` の入力値は変わらない
- したがって再レンダリングが起きない

---

### 解決策: `useCoAgentStateRender`

**推奨アプローチ**: Backend側でAgentの状態を管理し、Frontend側で状態変化を監視する

#### Backend実装（概念）

```typescript
// Backend CoAgent
type WorkflowState = {
  currentStep: string;
  completedSteps: string[];
  eventLog: Array<{
    timestamp: string;
    type: string;
    message: string;
  }>;
  progress: number;
};

// Workflowイベントごとに状態を更新
agent.setState({
  currentStep: "step2",
  completedSteps: ["step1"],
  eventLog: [...prevLogs, newEvent],
  progress: 50,
});
```

#### Frontend実装

```typescript
import { useCoAgentStateRender } from "@copilotkit/react-core";

type WorkflowState = {
  currentStep: string;
  completedSteps: string[];
  eventLog: Array<{
    timestamp: string;
    type: string;
    message: string;
  }>;
  progress: number;
};

useCoAgentStateRender<WorkflowState>({
  name: "workflow_agent",
  render: ({ state, status, nodeName }) => {
    return (
      <div className="workflow-ui">
        {/* 現在のステップ */}
        <div className="current-step">
          <h3>現在: {state.currentStep}</h3>
        </div>

        {/* 進捗バー */}
        <div className="progress-bar">
          <div
            style={{
              width: `${state.progress}%`,
              height: '8px',
              backgroundColor: '#6366f1',
              transition: 'width 0.3s ease'
            }}
          />
        </div>

        {/* 完了済みステップ */}
        <div className="completed-steps">
          {state.completedSteps.map((step, i) => (
            <div key={i} className="step-chip">
              ✓ {step}
            </div>
          ))}
        </div>

        {/* イベントログのリアルタイム表示 */}
        <div className="event-log">
          {state.eventLog.map((event, i) => (
            <div key={i} className={`event event-${event.type}`}>
              <span className="time">{event.timestamp}</span>
              <span className="message">{event.message}</span>
            </div>
          ))}
        </div>
      </div>
    );
  },
});
```

#### なぜ `useCoAgentStateRender` が動作するのか

1. **Backend側で状態を更新**
   - Workflowイベントごとに `agent.setState()` を呼ぶ
   - 状態はストリーミングでFrontendに送信される

2. **Frontend側で状態変化を検知**
   - `render` 関数の `state` パラメータが変化
   - `state` の変化により自動的に再レンダリングがトリガーされる

3. **確実な再レンダリング**
   - `render` 関数の入力値（`state`）が変わるため、Reactが確実に再実行
   - 同期ループの問題を回避

---

### appendMessage の制限

`appendMessage` は手軽にチャットメッセージを追加できるが、カスタマイズに制限がある。

#### TextMessage で指定できるオプション

```typescript
new TextMessage({
  role: MessageRole.User | MessageRole.Assistant,  // 必須
  content: string,                                  // 必須
  parentMessageId?: string,                         // オプション
  id?: string,                                      // オプション（自動生成）
  createdAt?: Date,                                 // オプション（自動生成）
  status?: MessageStatus,                           // オプション
})
```

**制限**:
- カスタムスタイルやクラス名は指定不可
- メッセージの種類（error, success, info）は指定不可
- リッチなUIコンポーネントは埋め込めない

#### 装飾方法

**方法1: Markdown**
```typescript
await appendMessage(
  new TextMessage({
    role: MessageRole.Assistant,
    content: "**🚀 Workflow開始**\n\n処理を開始しました...",
  })
);
```

**方法2: AssistantMessage コンポーネントのカスタマイズ**
```typescript
const CustomAssistantMessage = (props: AssistantMessageProps) => {
  const { message } = props;

  return (
    <div style={{
      backgroundColor: "#f0f1f2",
      borderRadius: "8px",
      padding: "16px",
    }}>
      <Markdown content={message.content || ""} />
    </div>
  );
};

<CopilotSidebar AssistantMessage={CustomAssistantMessage} />
```

---

### まとめ

| 要件 | 推奨方法 | 理由 |
|------|---------|------|
| シンプルなツールUI | `useCopilotAction` + `render` | 最も簡単 |
| ユーザー承認が必要 | `renderAndWaitForResponse` | HITL対応 |
| 非同期処理+UI | `useFrontendTool` | 完全なライフサイクル |
| **リアルタイムストリーミングUI** | **`useCoAgentStateRender`** | Backend状態監視で確実に再レンダリング |
| チャットメッセージ追加 | `appendMessage` | 手軽だがカスタマイズ不可 |

**重要**: ストリーミングUIをリアルタイムで更新したい場合は、`useCoAgentStateRender` が最適。`render` 関数の入力値が変わることで確実に再レンダリングが起きる。
