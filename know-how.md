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

---

## 🔄 Workflow Streaming API 徹底調査（2025-11-14）

### 調査目的

Mastra の Workflow には2つのストリーミング API があります:
- **Legacy API**: `run.stream()` - 現行の安定版
- **VNext API**: `run.streamVNext()` - 実験的な次世代版

**調査の焦点:**
1. 両方のAPIの動作を実際に確認
2. `writer.write()` のカスタムイベントが流れるか検証
3. どちらのAPIを使うべきか結論を出す

---

### テスト環境

**Workflow定義**: `/src/mastra/workflows/test-workflow.ts`
- step1: `writer.write({ type: "step-progress", message: "step1を開始しました" })`
- step2: `writer.write({ type: "step-progress", message: "step2を終了しました" })`

**API実装**: `/src/app/api/workflows/[workflowName]/stream/`
- `stream-legacy.ts`: Legacy API 実装
- `stream-vnext.ts`: VNext API 実装
- `route.ts`: コメントアウトで切り替え

**テスト入力**: `{ value: 'こんにちは' }`

---

### Legacy API: `run.stream()` テスト結果

#### 📊 API仕様

```typescript
const { stream, getWorkflowState } = await run.stream({
  inputData: body.inputData,
});

// stream をイテレート
for await (const chunk of stream) {
  // チャンク処理
}

// 最終状態を取得
const finalState = await getWorkflowState();
```

#### ✅ 実際に受信したイベント（8チャンク）

```javascript
// Chunk 1: Workflow開始
{ type: 'start', payload: { runId: 'af340ced-db8a-4a9a-adef-2714fe832c8f' } }

// Chunk 2-4: step1の実行
{ type: 'step-start', payload: {
    id: 'step1',
    stepCallId: '64221a85-23c4-46a2-81fd-7cc7affcd9e9',
    payload: { value: 'こんにちは' },
    startedAt: 1763064212245,
    status: 'running'
}}

{ type: 'step-result', payload: {
    id: 'step1',
    stepCallId: '64221a85-23c4-46a2-81fd-7cc7affcd9e9',
    status: 'success',
    output: { result: 'Step1: こんにちは' },
    endedAt: 1763064212247
}}

{ type: 'step-finish', payload: {
    id: 'step1',
    stepCallId: '64221a85-23c4-46a2-81fd-7cc7affcd9e9',
    metadata: {}
}}

// Chunk 5-7: step2の実行
{ type: 'step-start', payload: {
    id: 'step2',
    stepCallId: 'fc0e15ba-36e3-400f-99b3-ec541c508210',
    payload: { result: 'Step1: こんにちは' },
    startedAt: 1763064212247,
    status: 'running'
}}

{ type: 'step-result', payload: {
    id: 'step2',
    stepCallId: 'fc0e15ba-36e3-400f-99b3-ec541c508210',
    status: 'success',
    output: { finalResult: 'Step1: こんにちは -> Step2完了' },
    endedAt: 1763064212248
}}

{ type: 'step-finish', payload: {
    id: 'step2',
    stepCallId: 'fc0e15ba-36e3-400f-99b3-ec541c508210',
    metadata: {}
}}

// Chunk 8: Workflow完了
{ type: 'finish', payload: { runId: 'af340ced-db8a-4a9a-adef-2714fe832c8f' } }
```

#### ❌ 期待したが受信しなかったイベント

```javascript
// test-workflow.ts の15-18行目で定義
// step1開始後に期待:
{ type: "step-progress", message: "step1を開始しました" }

// test-workflow.ts の41-44行目で定義
// step2終了前に期待:
{ type: "step-progress", message: "step2を終了しました" }
```

**結論**: `stream()` は `writer.write()` のカスタムイベントを送信しない

#### 📦 getWorkflowState() の出力

```javascript
{
  status: 'success',
  steps: {
    input: { value: 'こんにちは' },
    step1: {
      payload: { value: 'こんにちは' },
      startedAt: 1763064212245,
      status: 'success',
      output: { result: 'Step1: こんにちは' },
      endedAt: 1763064212247
    },
    step2: {
      payload: { result: 'Step1: こんにちは' },
      startedAt: 1763064212247,
      status: 'success',
      output: { finalResult: 'Step1: こんにちは -> Step2完了' },
      endedAt: 1763064212248
    }
  },
  input: { value: 'こんにちは' },
  result: { finalResult: 'Step1: こんにちは -> Step2完了' },
  traceId: undefined  // ⚠️ Legacy API では traceId が取得できない
}
```

#### 📋 Legacy API まとめ

| 項目 | 結果 |
|------|------|
| **動作** | ✅ 正常にストリーミング |
| **イベント数** | 8チャンク（start, step-start×2, step-result×2, step-finish×2, finish） |
| **カスタムイベント** | ❌ `writer.write()` のイベントは送信されない |
| **最終状態取得** | ✅ `getWorkflowState()` で取得可能 |
| **traceId** | ❌ undefined（サポートなし） |
| **実行時間** | step1: 2ms, step2: 1ms（非常に高速） |

#### 🔍 重要な発見

1. **イベントの粒度が細かい**
   - 各ステップで `start`, `result`, `finish` の3イベント
   - タイムスタンプ付き（`startedAt`, `endedAt`）

2. **writer.write() が機能しない**
   - コードは実行されている（エラーなし）
   - しかしストリームには流れない
   - Legacy API の制限の可能性

3. **traceId がない**
   - デバッグ・トレーシングに制限
   - VNext API では改善されている可能性

---

### VNext API: `run.streamVNext()` テスト結果

#### 📊 API仕様

```typescript
const stream = run.streamVNext({
  inputData: body.inputData,
});

// ストリームを直接イテレート
for await (const chunk of stream) {
  // チャンク処理
}

// 追加のプロミスにアクセス可能
const result = await stream.result;
const status = await stream.status;
const usage = await stream.usage;
const traceId = stream.traceId;
```

#### ✅ 実際に受信したイベント（8チャンク）

```javascript
// チャンク1: Workflow開始
{ type: 'workflow-start', runId: 'eeec96d9-...', from: 'WORKFLOW',
  payload: { workflowId: 'testWorkflow' } }

// チャンク2-4: step1の実行
{ type: 'workflow-step-start', runId: 'eeec96d9-...', from: 'WORKFLOW',
  payload: { stepName: 'step1', id: 'step1', stepCallId: '0059d8a0-...',
    payload: { value: 'こんにちは' }, startedAt: 1763064408999, status: 'running' } }

// ✅ カスタムイベント！
{ type: 'workflow-step-output', runId: 'eeec96d9-...', from: 'USER',
  payload: { output: { type: 'step-progress', message: 'step1を開始しました' },
    runId: 'eeec96d9-...', stepName: 'step1' } }

{ type: 'workflow-step-result', runId: 'eeec96d9-...', from: 'WORKFLOW',
  payload: { stepName: 'step1', id: 'step1', stepCallId: '0059d8a0-...',
    status: 'success', output: { result: 'Step1: こんにちは' }, endedAt: 1763064409003 } }

// チャンク5-7: step2の実行
{ type: 'workflow-step-start', runId: 'eeec96d9-...', from: 'WORKFLOW',
  payload: { stepName: 'step2', id: 'step2', stepCallId: '214bb639-...',
    payload: { result: 'Step1: こんにちは' }, startedAt: 1763064409003, status: 'running' } }

// ✅ カスタムイベント！
{ type: 'workflow-step-output', runId: 'eeec96d9-...', from: 'USER',
  payload: { output: { type: 'step-progress', message: 'step2を終了しました' },
    runId: 'eeec96d9-...', stepName: 'step2' } }

{ type: 'workflow-step-result', runId: 'eeec96d9-...', from: 'WORKFLOW',
  payload: { stepName: 'step2', id: 'step2', stepCallId: '214bb639-...',
    status: 'success', output: { finalResult: 'Step1: こんにちは -> Step2完了' }, endedAt: 1763064409004 } }

// チャンク8: Workflow完了
{ type: 'workflow-finish', runId: 'eeec96d9-...', from: 'WORKFLOW',
  payload: { workflowStatus: 'success', output: { usage: {...} }, metadata: {} } }
```

#### 🎉 writer.write() のカスタムイベントを確認！

**重要な発見:**
- `workflow-step-output` イベントとして受信
- カスタムデータは `chunk.payload.output` にネストされている
- `from: 'USER'` フィールドでカスタムイベントを識別可能
- 各チャンクに `runId` が含まれる

#### 📦 stream.result / stream.status / stream.usage の出力

```javascript
// stream.result
{
  status: 'success',
  steps: {
    input: { value: 'こんにちは' },
    step1: {
      payload: { value: 'こんにちは' },
      startedAt: 1763064408999,
      status: 'success',
      output: { result: 'Step1: こんにちは' },
      endedAt: 1763064409003
    },
    step2: {
      payload: { result: 'Step1: こんにちは' },
      startedAt: 1763064409003,
      status: 'success',
      output: { finalResult: 'Step1: こんにちは -> Step2完了' },
      endedAt: 1763064409004
    }
  },
  input: { value: 'こんにちは' },
  result: { finalResult: 'Step1: こんにちは -> Step2完了' },
  traceId: undefined  // ⚠️ 環境設定が必要？
}

// stream.status
'success'

// stream.usage
{ inputTokens: 0, outputTokens: 0, totalTokens: 0 }
```

#### 📋 VNext API まとめ

| 項目 | 結果 |
|------|------|
| **動作** | ✅ 正常にストリーミング |
| **イベント数** | 8チャンク（workflow-start, workflow-step-start×2, **workflow-step-output×2**, workflow-step-result×2, workflow-finish） |
| **カスタムイベント** | ✅ `writer.write()` のイベントが `workflow-step-output` として受信可能！ |
| **最終状態取得** | ✅ `stream.result` でPromiseとして取得 |
| **ステータス取得** | ✅ `stream.status` でPromiseとして取得 |
| **使用量取得** | ✅ `stream.usage` でPromiseとして取得 |
| **traceId** | ⚠️ undefined（設定が必要？） |
| **実行時間** | step1: 4ms, step2: 1ms（Legacy とほぼ同じ） |

#### 🔍 重要な発見

1. **writer.write() が機能する！**
   - `workflow-step-output` タイプで受信
   - `chunk.payload.output` にカスタムデータ
   - `from: 'USER'` で識別可能

2. **イベント名が異なる**
   - Legacy: `start`, `step-start`, `step-result`, `step-finish`, `finish`
   - VNext: `workflow-start`, `workflow-step-start`, `workflow-step-output`, `workflow-step-result`, `workflow-finish`

3. **全イベントに runId が含まれる**
   - イベント相関が容易
   - デバッグしやすい

4. **from フィールドで送信元を識別**
   - `WORKFLOW`: システムイベント
   - `USER`: カスタムイベント（writer.write()）

---

### 比較と推奨

#### 📊 詳細比較表

| 項目 | Legacy `stream()` | VNext `streamVNext()` |
|------|-------------------|----------------------|
| **API形式** | `{ stream, getWorkflowState }` を返す | 直接イテレート可能なストリームを返す |
| **イベント数** | 8チャンク | 8チャンク |
| **イベント名** | start, step-start, step-result, step-finish, finish | workflow-start, workflow-step-start, **workflow-step-output**, workflow-step-result, workflow-finish |
| **カスタムイベント** | ❌ `writer.write()` 非対応 | ✅ `workflow-step-output` として受信可能 |
| **イベント構造** | シンプル（typeとpayloadのみ） | 詳細（type, runId, from, payload） |
| **最終状態取得** | `await getWorkflowState()` 関数 | `await stream.result` プロミス |
| **ステータス取得** | ❌ 不可 | ✅ `await stream.status` |
| **使用量取得** | ❌ 不可 | ✅ `await stream.usage` |
| **traceId** | ❌ undefined | ⚠️ undefined（設定次第で利用可能？） |
| **runId** | ❌ イベントに含まれない | ✅ 全イベントに含まれる |
| **from フィールド** | ❌ なし | ✅ WORKFLOW / USER で識別可能 |
| **使いやすさ** | `.stream` プロパティにアクセス必要 | ストリームを直接イテレート |
| **パフォーマンス** | 高速（step1: 2ms, step2: 1ms） | 高速（step1: 4ms, step2: 1ms） |
| **ステータス** | 現行の安定版 | 実験的（将来の標準） |

#### 🎯 推奨

### **✅ VNext `streamVNext()` を推奨**

**理由:**

1. **writer.write() のカスタムイベントが使える**
   - これが最大の決定的な違い
   - Legacy では完全に不可能
   - VNext なら `workflow-step-output` で受信可能

2. **より多くの情報にアクセス可能**
   - `stream.result`, `stream.status`, `stream.usage`
   - 各イベントに `runId` と `from` が含まれる

3. **将来の標準になる**
   - 公式ドキュメントで「experimental but will replace stream()」
   - 早めに移行しておく価値がある

4. **APIがより直感的**
   - 直接イテレート可能
   - `.stream` プロパティにアクセス不要

**Legacy を使うべきケース:**

- カスタムイベントが不要
- 安定性を最優先
- シンプルなイベント構造で十分

#### 💡 実装のポイント

**VNext でカスタムイベントを受信する方法:**

```typescript
for await (const chunk of stream) {
  // カスタムイベントをフィルタリング
  if (chunk.type === 'workflow-step-output' && chunk.from === 'USER') {
    const customEvent = chunk.payload.output;
    console.log('カスタムイベント:', customEvent);
    // 例: { type: 'step-progress', message: 'step1を開始しました' }
  }

  // システムイベントの処理
  if (chunk.from === 'WORKFLOW') {
    // workflow-start, workflow-step-start, workflow-step-result, workflow-finish
  }
}
```

**重要な注意点:**

- `await writer?.write()` を忘れない（ストリームロックエラーを防ぐ）
- カスタムイベントは `chunk.payload.output` にネストされている
- `from` フィールドで送信元を識別できる

#### 📝 結論

**Workflow でカスタム進捗イベントを送信したい場合は VNext 一択。**

Legacy API では `writer.write()` が機能しないため、リアルタイムの進捗表示やカスタムUIの実装が不可能。VNext API に移行することで、より豊富な情報をフロントエンドに送信でき、ユーザー体験の向上につながる。

---

## ⚠️ フロントエンドでWorkflowストリーミングUIが更新されない問題（2025-11-14）

### 🚨 問題の症状

**現象:**
- VNext API でカスタムイベントを送信している
- サーバー側でイベントは正しく流れている（ログで確認）
- しかし、`useCopilotAction` の `render` 関数が再レンダリングされない
- Workflow完了後に初めてUIが更新される

**影響:**
- リアルタイムの進捗表示ができない
- ユーザーは Workflow が動いているか分からない
- UX が著しく悪化

### 🔍 原因分析：Agent版との違い

#### ✅ Agent版（リアルタイム更新される）

**実装方法:**
```typescript
useCopilotAction({
  name: "callSubAgentDirectly",
  render: ({ args, status, result, actionExecutionId }) => {
    const callState = streamingStates[actionExecutionId];
    return <div>{callState.text}</div>; // ← streamingStates が変わると再レンダリング
  },
  handler: async ({ message, actionExecutionId }) => {
    const stream = await agent.stream({ messages: [...] });

    // ✅ onChunk コールバックで状態を更新
    await stream.processDataStream({
      onChunk: async (chunk) => {
        if (chunk.type === 'text-delta') {
          fullText += chunk.payload.text;
          setStreamingStates(prev => ({
            ...prev,
            [actionExecutionId]: { text: fullText, isStreaming: true }
          })); // ← この更新で render が再レンダリングされる！
        }
      },
    });
  }
});
```

**なぜ動作するのか:**
1. `onChunk` コールバックは **非同期処理の外側** で状態を更新
2. `setStreamingStates()` の呼び出しが React のイベントループで処理される
3. `render` 関数内で `streamingStates[actionExecutionId]` を参照
4. **状態が変わると `render` が再レンダリングされる**

#### ❌ Workflow版（更新されない）

**実装方法:**
```typescript
useCopilotAction({
  name: "callWorkflowDirectly",
  render: ({ args, status, result, actionExecutionId }) => {
    const workflowState = workflowStates[actionExecutionId];
    return <div>{workflowState.events.map(...)}</div>; // ← workflowStates が変わっても再レンダリングされない？
  },
  handler: async ({ value, actionExecutionId }) => {
    const response = await fetch('/api/workflows/testWorkflow/stream', {...});
    const reader = response.body?.getReader();

    // ❌ 同期ループ内で状態を更新
    while (true) {
      const { done, value: chunk } = await reader.read();
      if (done) break;

      // イベントをパース
      events.push(displayText);

      // flushSync で即座に更新を試みる
      flushSync(() => {
        setWorkflowStates(prev => ({
          ...prev,
          [actionExecutionId]: { events: [...events], isStreaming: true }
        })); // ← この更新が render に反映されない！
      });
    }
  }
});
```

**なぜ動作しないのか:**
1. `while (true)` ループは **handler 関数内で完全に完了する**
2. `setWorkflowStates()` が呼ばれても、`render` 関数は再評価されない
3. **`render` 関数の再レンダリング条件:**
   - `args` が変わる
   - `status` が変わる（'executing' → 'complete'）
   - `result` が変わる
4. ループ内の状態更新では、これらの条件が満たされない
5. `flushSync()` も無効（render の入力値が変わっていないため）

### 💡 根本的な違い

| 項目 | Agent版 | Workflow版 |
|------|---------|-----------|
| **ストリーミング方式** | `processDataStream({ onChunk })` | `while` ループ + `reader.read()` |
| **状態更新タイミング** | 非同期コールバック内 | 同期ループ内 |
| **Reactイベントループ** | ✅ 更新が反映される | ❌ ブロックされる |
| **renderの再レンダリング** | ✅ 状態変化で自動的に起こる | ❌ status/args が変わらないと起こらない |
| **UI更新** | ✅ リアルタイム | ❌ 完了後のみ |

### 🎯 解決策

#### 解決策1: `useCoAgentStateRender` を使う（推奨）

**Backend で Agent の状態を管理し、Frontend で監視:**

```typescript
// Backend: workflowAgent を作成
type WorkflowState = {
  currentStep: string;
  events: string[];
  progress: number;
};

// Frontend: 状態を監視
useCoAgentStateRender<WorkflowState>({
  name: "workflow_agent",
  render: ({ state, status }) => {
    return (
      <div>
        <h3>{state.currentStep}</h3>
        {state.events.map(event => <div>{event}</div>)}
        <progress value={state.progress} max="100" />
      </div>
    );
  }
});
```

**メリット:**
- Backend の状態変化を確実に検知
- `state` が変わると `render` が自動的に再レンダリング
- リアルタイムUI実装の正攻法

**デメリット:**
- Backend に Agent を追加する必要がある
- 既存の Workflow 実装を変更する必要がある

#### 解決策2: `appendMessage` を使う（簡易版）

**メッセージとして追加していく:**

```typescript
while (true) {
  const { done, value: chunk } = await reader.read();
  if (done) break;

  const eventData = JSON.parse(data);
  const displayText = formatEvent(eventData);

  // appendMessage でチャットに追加
  appendMessage(new TextMessage({
    content: displayText,
    role: 'assistant'
  }));
}
```

**メリット:**
- 実装が簡単
- リアルタイム表示される

**デメリット:**
- 見た目のカスタマイズ不可
- Markdown 装飾のみ可能

#### 解決策3: MastraClient の Workflow ストリーミングAPIを使う（要調査）

Agent版のように `processDataStream` が Workflow でもサポートされているか調査が必要。

### 📝 まとめ

**現状:**
- VNext API でカスタムイベントは送信できる
- しかし、`useCopilotAction` の `render` ではリアルタイム表示できない
- これは CopilotKit の設計上の制限

**推奨アプローチ:**
1. **`useCoAgentStateRender` を使う**（know-how.md 806-908行目参照）
2. Backend で Workflow を呼び出す Agent を作成
3. Workflow のイベントを Agent の状態として管理
4. Frontend で状態を監視してリアルタイム表示

**一時的な対処:**
- `appendMessage` を使って進捗をチャットに流す
- 完璧ではないが、リアルタイム表示は可能

---

### 🐛 追加の問題: `status="complete"` なのに「実行中」と表示される（2025-11-14）

#### 現象

Workflow 実行後、`status` は `"complete"` になっているのに、UI には「⏳ 実行中...」と表示されたままになる。

#### 原因

**問題のコード（page.tsx:196）:**
```typescript
render: ({ args, status, result, actionExecutionId }) => {
  const workflowState = workflowStates[actionExecutionId] || { events: [], isStreaming: false };

  return (
    <div>
      {workflowState.events.length === 0 && "⏳ 実行中..."}  // ← status を見ていない！
      {workflowState.events.map(...)}
    </div>
  );
}
```

**タイミングの問題:**

1. **handler 実行完了**（page.tsx:300-303）:
   ```typescript
   setWorkflowStates(prev => ({
     ...prev,
     [actionExecutionId]: { events, isStreaming: false }
   }));  // ← 非同期で処理される

   return `Workflow完了`;  // ← すぐに return
   ```

2. **CopilotKit が render を再実行:**
   - `status = "complete"` に変更
   - **しかし** `setWorkflowStates` はまだ反映されていない
   - `workflowState.events.length === 0` のまま

3. **結果:**
   - `status === "complete"` だが
   - `workflowState.events.length === 0` なので
   - 「⏳ 実行中...」と表示される

#### 根本原因

**React の状態更新は非同期:**
- `setWorkflowStates()` を呼んでも、即座には反映されない
- handler の return 後、render が再実行されるが、その時点ではまだ古い状態

**render 関数のロジックが status を無視:**
- `status` を見ずに `workflowState.events.length` だけで判断
- `status === "complete"` でも「実行中」と表示される

#### 解決策

**Option 1: status を優先する**
```typescript
{status === "executing" && workflowState.events.length === 0 && "⏳ 実行中..."}
{status === "complete" && workflowState.events.length === 0 && "✅ 完了（イベントなし）"}
{workflowState.events.map(...)}
```

**Option 2: result を表示する**
```typescript
{status === "complete" && result && (
  <div>✅ {result}</div>  // ← "Workflow完了: 8個のイベント"
)}
{status === "executing" && workflowState.events.length === 0 && "⏳ 実行中..."}
{workflowState.events.map(...)}
```

**Option 3: useEffect で状態同期**
```typescript
useEffect(() => {
  // status が complete になったら強制的に再レンダリング
  if (status === "complete") {
    forceUpdate();
  }
}, [status]);
```

#### 重要な教訓

1. **`status` は CopilotKit が管理する信頼できる値**
   - handler の実行状態を正確に反映
   - `"executing"` → `"complete"` の遷移は確実

2. **ユーザーが管理する状態（useState）は非同期**
   - `setState` は即座に反映されない
   - render 関数で参照する際は注意が必要

3. **表示ロジックは `status` を最優先すべき**
   - `status === "complete"` なら完了と表示
   - ユーザー管理の状態はあくまで補助情報