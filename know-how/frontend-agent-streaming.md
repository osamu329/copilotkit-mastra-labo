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

