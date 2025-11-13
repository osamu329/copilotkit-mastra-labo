# TODO: Mastra + CopilotKit プロジェクト

## 📚 ドキュメント構造

プロジェクトのノウハウは `know-how/` ディレクトリで管理されています：

- **[know-how/index.md](./know-how/index.md)**: 全体サマリ（必読）
- 各セクションの詳細は index.md のリンクから参照

**完了したタスク:**
- **[DONE.md](./DONE.md)**: 完了したタスクの記録

---

## 🎯 次にやること

### 優先タスク1: Workflow UI のリアルタイム更新実装

**目的:** `useCoAgentStateRender` でリアルタイムストリーミング UI を実装

**実装手順:**

1. **Backend: WorkflowAgent の作成**
   - 新しい Agent（`workflowAgent`）を作成
   - Agent の状態型を定義:
     ```typescript
     type WorkflowState = {
       currentStep: string;
       completedSteps: string[];
       eventLog: Array<{ timestamp: string; type: string; message: string; }>;
       progress: number;
     };
     ```
   - ファイル: `/src/mastra/agents/index.ts`

2. **Backend: Workflow Tool の実装**
   - Workflow を呼び出す Tool を作成
   - Workflow のイベントごとに `agent.setState()` で状態更新
   - ファイル: `/src/mastra/tools/index.ts`

3. **Frontend: `useCoAgentStateRender` の実装**
   - `useCoAgentStateRender<WorkflowState>` を追加
   - Backend の状態変化をリアルタイムで UI に反映
   - カスタム UI コンポーネントで見た目を制御
   - ファイル: `/src/app/page.tsx`

4. **Suggestion の追加**
   - 新しいアクションを suggestions 配列に追加
   - 例: "Run Workflow (CoAgent State)"

**参考ドキュメント:**
- [know-how/generative-ui.md](./know-how/generative-ui.md): useCoAgentStateRender の詳細
- [know-how/workflow-ui-issues.md](./know-how/workflow-ui-issues.md): 問題の背景

**注意:**
- 既存の `callWorkflowDirectly` / `callWorkflowWithAppendMessage` は削除しない
- 3つの実装方法を並列で比較できるようにする

---

### 優先タスク2: Workflow の status 表示バグ修正

**問題:**
- `status === "complete"` なのに「⏳ 実行中...」と表示される
- page.tsx:196 行目のロジックが status を無視している

**修正方法（Option 1: status を優先）:**
```typescript
{status === "executing" && workflowState.events.length === 0 && "⏳ 実行中..."}
{status === "complete" && workflowState.events.length === 0 && "✅ 完了（イベントなし）"}
{workflowState.events.map(...)}
```

**修正方法（Option 2: result を表示）:**
```typescript
{status === "complete" && result && (
  <div>✅ {result}</div>  // ← "Workflow完了: 8個のイベント"
)}
{status === "executing" && workflowState.events.length === 0 && "⏳ 実行中..."}
{workflowState.events.map(...)}
```

**ファイル:** `/src/app/page.tsx` の 196行目

---

## 📁 プロジェクト構造

```
src/
├── mastra/
│   ├── agents/
│   │   └── index.ts              # weatherAgent, subAgent, (今後: workflowAgent)
│   ├── workflows/
│   │   └── test-workflow.ts      # testWorkflow定義（step1, step2）
│   ├── tools/
│   │   └── index.ts              # 既存Tool + (今後: Workflow呼び出しTool)
│   └── index.ts                  # Mastra インスタンス
├── app/
│   ├── page.tsx                  # useCopilotAction実装
│   └── api/
│       ├── agents/[agentName]/
│       │   ├── generate/route.ts # Agent generate API
│       │   └── stream/route.ts   # Agent stream API
│       └── workflows/[workflowName]/
│           └── stream/
│               ├── route.ts      # API切り替えポイント
│               ├── stream-legacy.ts   # stream() 実装
│               └── stream-vnext.ts    # streamVNext() 実装（推奨）
├── lib/
│   └── mastra-client.ts          # MastraClient 初期化
└── components/                   # UI コンポーネント

know-how/
├── index.md                      # 全体サマリ（必読）
├── sub-agent-visualization.md    # Sub-Agent可視化の試行錯誤
├── sub-agent-setup.md            # Sub-Agent設定方法
├── frontend-agent-streaming.md   # Agent直接呼び出し
├── frontend-workflow-streaming.md # Workflow直接呼び出し
├── generative-ui.md              # Generative UI実装方法
├── workflow-streaming-api.md     # Streaming API詳細調査
└── workflow-ui-issues.md         # UI更新問題とトラブルシューティング
```

---

## 🔗 重要な参考リンク

### 内部ドキュメント
- [know-how/index.md](./know-how/index.md): プロジェクトのノウハウ全体サマリ
- [CLAUDE.md](./CLAUDE.md): 開発ガイドとクイックリファレンス

### 外部ドキュメント
- [Mastra Tool Streaming](https://github.com/mastra-ai/mastra/blob/main/docs/src/content/en/docs/streaming/tool-streaming.mdx)
- [CopilotKit useCopilotAction](https://docs.copilotkit.ai/reference/hooks/useCopilotAction)
- [CopilotKit Generative UI](https://docs.copilotkit.ai/concepts/generative-ui)

---

## 📝 重要な学び

### MastraClient の baseUrl
- **MastraClient は自動的に `/api/` を追加する**
- `baseUrl: '/api/mastra'` → `/api/mastra/api/agents/...` と重複（❌）
- `baseUrl: window.location.origin` → 正解（✅）

### stream() vs streamVNext()
- **stream()**: `{ stream, getWorkflowState }` を返す
  - ❌ カスタムイベント非対応
- **streamVNext()**: ストリーム自体を返す
  - ✅ カスタムイベント対応（workflow-step-output）
  - ✅ stream.result, stream.status, stream.usage で追加情報取得

### useCopilotAction の status
- **CopilotKit が自動管理する値**
- `"executing"` → handler 実行中
- `"complete"` → handler 完了
- ❌ ユーザーコードで変更不可
- ✅ 表示ロジックで最優先すべき

### render 関数の再レンダリング
- `status` や `args` が変わらないと再レンダリングされない
- handler 内の `setState` では再レンダリングされない
- → `useCoAgentStateRender` で Backend 状態管理が必要
