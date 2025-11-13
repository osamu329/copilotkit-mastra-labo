# Mastra + CopilotKit プロジェクト開発ガイド

このプロジェクトは Mastra フレームワークと CopilotKit を統合した AI エージェントアプリケーションです。

## 📚 ドキュメント

詳細な開発ノウハウは **[know-how.md](./know-how.md)** を参照してください。

### know-how.md の内容

1. **Sub-Agent とのやり取りを可視化する試行錯誤**
   - `writer.write()` でのカスタムメッセージ送信（動作しない理由）
   - `stream.textStream.pipeTo(writer)` でのストリーミング（制限事項）
   - `useCopilotAction` の `render` での可視化（推奨方法）

2. **Sub-Agent の設定**
   - `description` プロパティの重要性
   - `.network()` メソッドの使用方法
   - Mastra インスタンスへの登録方法
   - Tool 経由での呼び出し方法

3. **✅ フロントエンドから直接 Agent をストリーミング呼び出し【成功】**
   - MastraClient を使った Agent の直接呼び出し
   - SSE形式のストリーミング実装
   - `processDataStream` の正しい使い方
   - 複数回呼び出しの独立したステート管理

4. **✅ フロントエンドから直接 Workflow をストリーミング呼び出し【成功】**
   - Workflow の定義と `writer.write()` の使用
   - API Route の分離（agents / workflows）
   - `run.streamVNext()` を使ったストリーミング
   - Workflow イベントのリアルタイム表示

5. **トラブルシューティング**
   - Anthropic API のタイムアウトエラー対処法
   - CopilotKit の設定（サイドバー、Suggestion）
   - Workflow API の正しい使い方（`.then()` vs `.step()`）

---

## ⚡ クイックリファレンス

### Sub-Agent を可視化する正しい方法

```typescript
// ❌ 動作しない: writer.write() でカスタムメッセージ
// ❌ 動作しない: stream.textStream.pipeTo(writer) のリアルタイム表示

// ✅ 動作する: useCopilotAction の render を使用
useCopilotAction({
  name: "call-sub-agent",
  render: ({ args, status, result }) => {
    // status: "executing" | "complete"
    // result: ツールの最終結果
  },
});
```

### Sub-Agent の必須設定

```typescript
export const subAgent = new Agent({
  name: "Sub Agent",
  description: "エージェントの役割を記述", // ← 必須！
  model: anthropic("claude-haiku-4-5"),
  instructions: "...",
});

// Mastra インスタンスに登録
export const mastra = new Mastra({
  agents: {
    mainAgent,
    subAgent, // ← フロントエンドからアクセスするには登録が必要
  },
});
```

### Tool から Sub-Agent を呼び出す

```typescript
execute: async ({ context, mastra, writer }) => {
  // ✅ 正しい: キー名でアクセス
  const agent = mastra?.getAgent('subAgent');

  // ❌ 間違い: name プロパティではない
  // const agent = mastra?.getAgent('Sub Agent');

  // ストリーミング対応
  if (writer) {
    const stream = await agent.stream(context.message);
    await stream!.textStream.pipeTo(writer);
    return { response: await stream!.text };
  }
}
```

---

## 🎯 重要な学び

1. **CopilotKit はツールのリアルタイムストリーミングを直接表示しない**
   - Mastra の `writer.write()` や `pipeTo()` は実行されるが、UI には反映されない
   - `useCopilotAction` の `render` で可視化する必要がある

2. **ツールの可視化は `status` と `result` の2段階**
   - `status === "executing"`: 実行中の表示
   - `status === "complete"`: 完了後に `result` を表示

3. **Sub-Agent の `description` は必須**
   - 親エージェントがどの sub-agent を使うべきか判断する材料になる

4. **`mastra.getAgent()` はキー名を使う**
   - エージェントの `name` プロパティではない
   - エラーメッセージから正しいキー名を確認できる

---

## 🔗 参考リンク

- [Mastra Tool Streaming Documentation](https://github.com/mastra-ai/mastra/blob/main/docs/src/content/en/docs/streaming/tool-streaming.mdx)
- [CopilotKit useCopilotAction Reference](https://docs.copilotkit.ai/reference/hooks/useCopilotAction)
- [CopilotKit Generative UI Guide](https://docs.copilotkit.ai/concepts/generative-ui)

---

## 📝 プロジェクト構成

```
src/
├── mastra/
│   ├── agents/
│   │   └── index.ts               # Agent 定義（weatherAgent, subAgent）
│   ├── workflows/
│   │   └── test-workflow.ts      # Workflow 定義（testWorkflow）
│   ├── tools/
│   │   └── index.ts               # Tool 定義（weatherTool）
│   └── index.ts                   # Mastra インスタンス
├── app/
│   ├── page.tsx                   # メインページ（useCopilotAction の定義）
│   └── api/
│       ├── copilotkit/
│       │   └── route.ts           # CopilotKit API エンドポイント
│       └── mastra/
│           ├── agents/[...path]/
│           │   └── route.ts       # Agent 専用 API
│           └── workflows/[...path]/
│               └── route.ts       # Workflow 専用 API
├── lib/
│   └── mastra-client.ts           # MastraClient 初期化
└── components/                    # UI コンポーネント
```

---

## 🚀 Workflow の正しい定義方法

```typescript
// ❌ 間違い: .step() は Legacy API
export const workflow = createWorkflow({ ... })
  .step(step1)  // エラー！
  .step(step2)
  .commit();

// ✅ 正しい: vNext API は .then() を使う
export const workflow = createWorkflow({
  id: "workflowName",
  inputSchema: z.object({ ... }),
  outputSchema: z.object({ ... }),
  steps: [step1, step2],  // 型安全性のため宣言
})
  .then(step1)  // .then() でチェーン
  .then(step2)
  .commit();
```

---

## 📡 ストリーミング実装の要点

### Agent ストリーミング
- MastraClient で `agent.stream()` を呼び出し
- `processDataStream({ onChunk })` で ChunkType イベントを処理
- SSE形式（`data: {json}\n\n`）に変換が必要

### Workflow ストリーミング
- `run.streamVNext()` で Workflow を実行
- `for await (const chunk of stream)` でイベントを取得
- `writer.write()` のカスタムイベントも含めて全イベントをストリーム
- SSE形式への変換が必要

---

## 🎨 Generative UI の実装方法

CopilotKitでは、AIがカスタムReactコンポーネントを生成・表示できます。

### 実装方法一覧

| 方法 | 用途 | 特徴 |
|------|------|------|
| `useCopilotAction` + `render` | 基本的なツールUI | 最もシンプル、`status`と`args`で再レンダリング |
| `renderAndWaitForResponse` | ユーザー入力待ち | HITL実装、`respond()`でAIに結果を返す |
| `useFrontendTool` | 非同期処理+UI | `handler`で処理、`render`で表示 |
| `useCoAgentStateRender` | **リアルタイムストリーミング** | Backend状態変化を監視、最も動的 |
| `useRenderToolCall` | レンダリング専用 | Backend Actionと組み合わせる |

### リアルタイムストリーミングUIの問題と解決

**問題**: `render` 関数は `status` や `args` が変わらないと再レンダリングされない
- 同期ループ内で `setState` しても反映されない
- `flushSync` も効果なし
- `appendMessage` は見た目のカスタマイズ不可

**解決策**: `useCoAgentStateRender` を使う

```typescript
import { useCoAgentStateRender } from "@copilotkit/react-core";

type WorkflowState = {
  currentStep: string;
  events: string[];
  progress: number;
};

useCoAgentStateRender<WorkflowState>({
  name: "workflow_agent",
  render: ({ state, status }) => {
    return (
      <div>
        <h3>{state.currentStep}</h3>
        <progress value={state.progress} max="100" />
        {state.events.map((event, i) => (
          <div key={i}>{event}</div>
        ))}
      </div>
    );
  },
});
```

**特徴**:
- Backend側でAgentの状態を更新するたびに自動再レンダリング
- `state` の変化により確実に再レンダリングされる
- Workflowのストリーミングイベント表示に最適

### appendMessage の制限

- `TextMessage` は `content` と `role` のみ指定可能
- カスタムスタイルやクラス名は指定不可
- Markdown での装飾のみ可能
- リッチなUIには `render` 関数が必要

---

## 🚀 今後チャレンジしたい実装

### Workflow での Human-In-The-Loop (HITL)

**目的**: Workflow実行中にユーザーの承認を待ち、承認後に処理を続行する

**実装方法**: `renderAndWaitForResponse` を活用

```typescript
useCopilotAction({
  name: "executeWorkflowWithApproval",
  description: "Workflow を実行し、各ステップでユーザー承認を得る",
  parameters: [
    { name: "workflowId", type: "string", required: true },
    { name: "stepData", type: "object", required: true }
  ],
  renderAndWaitForResponse: ({ args, status, respond }) => {
    const { workflowId, stepData } = args;

    return (
      <div style={{
        padding: "16px",
        border: "2px solid #f59e0b",
        borderRadius: "8px",
        backgroundColor: "#fef3c7"
      }}>
        <h3>⚠️ 承認が必要です</h3>
        <p>Workflow: {workflowId}</p>
        <pre>{JSON.stringify(stepData, null, 2)}</pre>

        <div style={{ marginTop: "16px", display: "flex", gap: "8px" }}>
          <button
            onClick={() => respond?.("User approved. Continue workflow.")}
            style={{
              padding: "8px 16px",
              backgroundColor: "#10b981",
              color: "white",
              border: "none",
              borderRadius: "4px"
            }}
          >
            ✓ 承認する
          </button>

          <button
            onClick={() => respond?.("User rejected. Stop workflow.")}
            style={{
              padding: "8px 16px",
              backgroundColor: "#ef4444",
              color: "white",
              border: "none",
              borderRadius: "4px"
            }}
          >
            ✗ 拒否する
          </button>
        </div>
      </div>
    );
  }
});
```

**実装のポイント**:
1. Workflow の各ステップで承認が必要な箇所を特定
2. Backend で Workflow を一時停止し、Frontend Action を呼び出す
3. `respond()` で結果を Backend に返す
4. Backend は結果に応じて Workflow を続行 or 中断

**参考**:
- know-how.md の Generative UI セクション（728行目）
- MoonCard コンポーネント（`src/components/moon.tsx`）の実装例

---

詳細な試行錯誤の過程や技術的な理由については、**[know-how.md](./know-how.md)** を参照してください。
