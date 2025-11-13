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

