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

