# useCoAgentStateRender 調査結果

## 📅 調査日: 2025-11-14

## 🎯 目的

Workflow のリアルタイムストリーミングイベントを `useCoAgentStateRender` で可視化できるか調査

## 🔍 調査内容

### 計画していた実装

1. **Backend: WorkflowAgent 作成**
   - Workflow を実行する Agent
   - Working Memory で状態管理

2. **Backend: Workflow Tool 実装**
   - Workflow を呼び出す Tool
   - イベントごとに `agent.setState()` で状態更新

3. **Frontend: useCoAgentStateRender 実装**
   - Backend の状態変化をリアルタイムで UI に反映

### 期待していた動作

```typescript
// Tool 内で Workflow イベントを処理
for await (const chunk of stream) {
  if (chunk.type === "workflow-step-start") {
    await agent.setState({  // ← これができると思っていた
      currentStep: chunk.payload.stepName,
      events: [...state.events, "ステップ開始"],
      progress: 50,
    });
  }
}
```

## ❌ 実現不可能と判明

### 理由1: `setState()` メソッドは存在しない

**Mastra Agent には `setState()` メソッドがない**

```typescript
const agent = mastra.getAgent("workflowAgent");
await agent.setState({ ... });
// ❌ Property 'setState' does not exist on type 'Agent'
```

**CopilotKit も `setState()` を提供していない**

- CopilotKit ドキュメント全体を調査
- Agent に `setState()` を追加する API は見つからず
- TODO.md の記載 `agent.setState()` は誤りだった

### 理由2: Tool から Working Memory を直接更新できない

**memory.updateWorkingMemory() は使えるが...**

```typescript
const memory = mastra?.getMemory();
await memory.updateWorkingMemory({
  threadId: "thread-id",      // ← どこから取得する？
  resourceId: "resource-id",  // ← Tool では取得できない
  workingMemory: "更新内容"
});
```

- `threadId` と `resourceId` が必要
- Tool の `execute` 関数では取得方法が不明
- CopilotKit との統合で自動的に設定されるか不明

### 理由3: Working Memory は LLM が自動管理

**Agent の instructions で指示する方式**

```typescript
export const workflowAgent = new Agent({
  instructions: `
    Update your working memory with:
    - currentStep: 現在のステップ
    - events: イベントリスト
    - progress: 進捗率
  `,
  memory: new Memory({
    options: {
      workingMemory: {
        enabled: true,
        schema: WorkflowStateSchema,
      },
    },
  }),
});
```

**問題点:**
- Agent（LLM）が判断して更新する
- Tool から明示的に更新できない
- リアルタイムイベントの反映は困難

## ✅ 実際の Working Memory 更新方法

### パターン1: Agent の instructions で指示（LLM 任せ）

```typescript
// Agent が自動的に Working Memory を更新
// Tool の結果を見て LLM が判断
```

**制限:**
- リアルタイム性なし
- Agent 実行後に状態が更新される
- Workflow の途中経過は反映されない

### パターン2: Frontend で useCoAgent を使う

```typescript
const { state, setState } = useCoAgent<AgentState>({
  name: "workflowAgent",
  initialState: { ... }
});

// Frontend から状態を更新
setState({ currentStep: "..." });
```

**制限:**
- Backend イベントを Frontend が受け取る必要がある
- Tool からの自動更新ではない

### パターン3: writer.write() でカスタムイベント送信

```typescript
// Tool 内
await writer?.write({
  type: "progress-update",
  payload: { current: 5, total: 10 }
});
```

**制限:**
- `useCopilotAction` の `render` は `status`/`args` 変化時のみ再レンダリング
- リアルタイム表示には不向き

## 📊 調査で分かったこと

### CopilotKit + Mastra の状態管理

| 方法 | 場所 | 用途 | リアルタイム性 |
|------|------|------|--------------|
| `useCoAgent()` | Frontend | 状態の読み取り・更新 | ✅ |
| `useCoAgentStateRender()` | Frontend | Backend 状態の表示 | ✅ |
| Working Memory | Backend | Agent の内部状態 | ❌（LLM 判断） |
| `writer.write()` | Backend (Tool) | カスタムイベント | ⚠️（制限あり） |

### useCoAgentStateRender の正しい使い方

**Working Memory が LLM により更新されると、自動的に Frontend に反映される**

```typescript
// Backend: Agent の instructions で状態管理を指示
export const myAgent = new Agent({
  instructions: `
    Track your progress in working memory:
    - status: "idle" | "running" | "completed"
    - currentTask: string
  `,
  memory: new Memory({
    options: {
      workingMemory: {
        enabled: true,
        schema: StateSchema,
      },
    },
  }),
});

// Frontend: 状態変化を自動表示
useCoAgentStateRender<MyState>({
  name: "myAgent",
  render: ({ state }) => {
    return <div>{state.currentTask}</div>;
  },
});
```

**利用可能なシナリオ:**
- Agent が Task を完了したら状態を更新
- Agent が判断して状態を変更
- LLM ベースの状態管理

**利用不可能なシナリオ:**
- Tool からの明示的な状態更新
- Workflow のリアルタイムイベント反映
- ストリーミング進捗の即座表示

## 🎯 結論

### useCoAgentStateRender は Workflow リアルタイム表示には使えない

**理由:**
1. Tool から Agent の状態を直接更新できない
2. Working Memory は LLM が自動管理
3. リアルタイムイベントの反映メカニズムがない

### 推奨される実装方法

**Workflow の直接呼び出し（既存実装）**

```typescript
// すでに動作している実装を維持
useCopilotAction({
  name: "callWorkflowDirectly",
  handler: async ({ value }) => {
    // Workflow を直接呼び出し
    const response = await fetch('/api/workflows/testWorkflow/stream', {
      method: 'POST',
      body: JSON.stringify({ inputData: { value } }),
    });

    // SSE をパース
    for await (const chunk of parseSSE(response)) {
      // 状態を更新
      setWorkflowState({ events: [...events, chunk] });
    }
  },
  render: ({ args, status }) => {
    // workflowState を表示
  }
});
```

**メリット:**
- ✅ リアルタイムイベント表示
- ✅ writer.write() のメッセージも表示
- ✅ シンプルで確実
- ✅ すでに動作している

## 📝 学んだこと

1. **`agent.setState()` は存在しない**
   - Mastra にも CopilotKit にもない
   - TODO.md の記載は誤り

2. **Working Memory は LLM が管理**
   - Tool から直接操作できない
   - instructions で更新を指示するのみ

3. **useCoAgentStateRender の適用範囲**
   - Agent の判断による状態変化には有効
   - Tool からの明示的な更新には不向き

4. **既存実装が最適**
   - Workflow 直接呼び出しで要件を満たせる
   - 複雑な Agent 経由は不要

## 🔗 参考

- [know-how/generative-ui.md](./generative-ui.md): useCoAgentStateRender の詳細
- [know-how/frontend-workflow-streaming.md](./frontend-workflow-streaming.md): Workflow 直接呼び出し
- Context7 調査結果（2025-11-14）: CopilotKit Agent setState API
- Context7 調査結果（2025-11-14）: Mastra Agent の状態管理

## 🚀 次のステップ

**TODO.md を更新**
- 優先タスク1（useCoAgentStateRender 実装）を削除
- 既存実装で十分と記載
- 今回の調査結果を参照

**know-how/index.md を更新**
- このドキュメントへのリンクを追加
- useCoAgentStateRender の制限事項を記載
