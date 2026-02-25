# @ag-ui/mastra フォーク版 (src/lib/ag-ui-mastra)

## 概要

`@ag-ui/mastra` パッケージの `MastraAgent` をフォークしたもの。
`@mastra/core` v1.7.0 に対応し、AG-UI の `AbstractAgent` を継承して Mastra Agent のストリームを AG-UI イベントに変換する。

## フォークした理由

- `@ag-ui/mastra` が依存する Mastra API（`streamVNext`, `RuntimeContext`, `vnext_getNetworks` 等）が `@mastra/core` v1.7.0 に存在しない
- ツール引数が `undefined` の場合のバグ修正（`args ?? {}` への対応）
- デバッグログの追加

## ファイル構成

```
src/lib/ag-ui-mastra/
├── index.ts      # re-export
├── mastra.ts     # MastraAgent クラス本体
└── utils.ts      # メッセージ変換、Agent取得ヘルパー
```

## 元パッケージからの主な変更点

### API の v1.7.0 対応

| 元パッケージ (vnext API) | フォーク版 (v1.7.0) |
|---|---|
| `import { RuntimeContext } from "@mastra/core/runtime-context"` | `import { RequestContext } from "@mastra/core/request-context"` |
| `import type { StorageThreadType } from "@mastra/core"` | `import type { StorageThreadType } from "@mastra/core/memory"` |
| `import type { CoreMessage } from "@mastra/core"` | `import type { CoreMessage } from "@mastra/core/llm"` |
| `agent.streamVNext(messages, opts)` | `agent.stream(messages, opts)` |
| `mastra.getAgents()` | `mastra.listAgents()` |
| `mastraClient.getAgents()` | `mastraClient.listAgents()` |
| stream options: `{ threadId, resourceId, runId, clientTools, runtimeContext }` | `{ memory: { thread, resource }, runId, clientTools, requestContext }` |

### fullStream の読み取り

v1.7.0 の `fullStream` は Web `ReadableStream` であり、async iterable ではない。
`getReader()` パターンで読み取る。

```typescript
const reader = response.fullStream.getReader();
try {
  while (true) {
    const { done, value: chunk } = await reader.read();
    if (done) break;
    // chunk.type で分岐
  }
} finally {
  reader.releaseLock();
}
```

### clone() オーバーライド

`AbstractAgent.clone()` は `Object.create()` + 手動プロパティコピーで実装されており、
**コンストラクタを呼ばない**。そのためサブクラスのフィールドがすべて `undefined` になる。

CopilotKit ランタイム (`handle-run.mjs`) は `agent.clone()` を毎リクエストで呼ぶため、
`clone()` をオーバーライドしてサブクラス固有プロパティをコピーする必要がある。

```typescript
clone(): MastraAgent {
  const cloned = super.clone() as MastraAgent;
  cloned.agent = this.agent;
  cloned.resourceId = this.resourceId;
  cloned.requestContext = this.requestContext;
  cloned.seenEventTypes = new Set<string>();
  cloned.seenChunkTypes = new Set<string>();
  return cloned;
}
```

### 削除した機能

- `getNetwork` / `GetNetworkOptions` — v1.7.0 に `vnext_getNetwork()` / `vnext_getNetworks()` が存在しないため削除

## イベントフロー

### Mastra chunk types → AG-UI event types

実際の通信で観測されたフロー:

```
Mastra chunks (fullStream)          AG-UI events (Observable<BaseEvent>)
──────────────────────              ─────────────────────────────────────
                                    RUN_STARTED
start
step-start
tool-call-input-streaming-start
tool-call-delta
tool-call-input-streaming-end
tool-call                     →     TOOL_CALL_START
                              →     TOOL_CALL_ARGS
                              →     TOOL_CALL_END
  (Mastra がツールを実行)
tool-result                   →     TOOL_CALL_RESULT
step-finish
text-start
text-delta                    →     TEXT_MESSAGE_CHUNK
text-end
finish                        →     RUN_FINISHED
```

### 変換ルール

| Mastra chunk.type | AG-UI EventType | 備考 |
|---|---|---|
| `text-delta` | `TEXT_MESSAGE_CHUNK` | `chunk.payload.text` → `delta` |
| `tool-call` | `TOOL_CALL_START` + `TOOL_CALL_ARGS` + `TOOL_CALL_END` | 1チャンクから3イベント生成 |
| `tool-result` | `TOOL_CALL_RESULT` | `chunk.payload.result` → JSON文字列化 |
| `finish` | (onFinishMessagePart) | messageId を再生成、次のメッセージに備える |
| `error` | (subscriber.error) | Observable のエラーとして伝播 |
| `start`, `step-start`, `step-finish`, `text-start`, `text-end`, `tool-call-input-streaming-*`, `tool-call-delta` | (無視) | AG-UI イベントへの変換なし |

### 未変換の Mastra chunk types

以下の chunk types は AG-UI イベントに変換されない。今後の拡張候補:

- `start`, `step-start`, `step-finish` — STEP_STARTED / STEP_FINISHED へのマッピング
- `tool-call-input-streaming-start/end`, `tool-call-delta` — ツール引数のストリーミング表示
- `reasoning-start/delta/end` — REASONING イベントへのマッピング
- `text-start`, `text-end` — TEXT_MESSAGE_START / TEXT_MESSAGE_END

## 使用方法

```typescript
// route.ts
import { MastraAgent } from "@/lib/ag-ui-mastra";
import { mastra } from "@/lib/mastra";

const aguiAgent = new MastraAgent({
  agentId: "data-agent",
  agent: mastra.getAgent("data-agent"),
  resourceId: "default",
});
```

## デバッグログ

フォーク版には2種類のデバッグログが組み込まれている（リクエストごとに重複排除）:

- `📡 [ag-ui event] <type>` — AG-UI イベントの type（subscriber.next 経由）
- `📦 [mastra chunk] <type>` — Mastra fullStream の chunk type
- `🔧 [ag-ui] onToolCallPart/onToolResultPart` — ツールコールの詳細
