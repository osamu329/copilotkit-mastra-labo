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

