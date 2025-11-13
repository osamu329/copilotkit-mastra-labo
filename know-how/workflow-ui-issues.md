# Workflow UI の問題とトラブルシューティング

このドキュメントでは、Workflow実装時に発生した問題とその解決策をまとめています。

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
