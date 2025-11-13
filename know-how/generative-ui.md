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

