# TODO: Mastra Streaming API調査とWorkflow最適化

## 現状まとめ

### 完了した作業

1. ✅ **APIルート構造の変更（2025-11-14）**
   - `/api/mastra/agents` → `/api/agents` に変更
   - `/api/mastra/workflows` → `/api/workflows` に変更
   - MastraClientのbaseUrlを修正（自動的に `/api/` を追加するため）
   - コミット: `b288ad7`

2. ✅ **Workflow streaming API の変更**
   - `run.streamVNext()` → `run.stream()` に変更
   - 返り値: `{ stream, getWorkflowState }` を受け取る構造に
   - ファイル: `/src/app/api/workflows/[workflowName]/stream/route.ts`

3. ✅ **エンドポイントの分離**
   - Agent generate/stream を専用ルートに分離
   - Workflow stream を専用ルートに分離
   - 未使用の `[...path]/route.ts` を削除

4. ✅ **Generative UIに関する調査完了**
   - `useCoAgentStateRender` がリアルタイムストリーミングUIに最適と判明
   - 5つの実装方法を整理（`useCopilotAction`, `renderAndWaitForResponse`, `useFrontendTool`, `useCoAgentStateRender`, `useRenderToolCall`）
   - 詳細は **know-how.md の「🎨 Generative UI の深掘り調査」セクション** を参照

5. ✅ **ドキュメント更新完了**
   - **CLAUDE.md**: 「🎨 Generative UI の実装方法」セクションを追加（193行目〜）
   - **know-how.md**: 「🎨 Generative UI の深掘り調査」セクションを追加（705行目〜）

6. ✅ **appendMessage版のWorkflow Action実装**
   - `callWorkflowWithAppendMessage` Action を追加済み
   - ファイル: `/src/app/page.tsx` (316-417行目)
   - リアルタイム表示は成功したが、見た目のカスタマイズ不可

### 現在の課題

**Mastra Streaming APIの理解と最適化が必要**

1. **`stream()` と `streamVNext()` の違いを深く理解する**
   - 現在は `stream()` に変更したが、動作確認が必要
   - `stream()` の返り値 `{ stream, getWorkflowState }` の活用方法
   - `streamVNext()` の追加機能（status, usage, traceId）との比較

2. **Workflow ストリーミングの最適化**
   - 現在の実装でどのようなイベントが流れているか確認
   - `writer.write()` のカスタムイベントが正しく流れているか検証
   - SSE形式への変換が適切か確認

3. **リアルタイム表示の問題**
   - `render` + `useState` → 再レンダリングされない（`status`/`args`が変わらないため）
   - `flushSync` → 効果なし（同期ループでブロック）
   - `appendMessage` → 動作するが見た目カスタマイズ不可

---

## 次にやること

### 🎯 優先タスク: Mastra Streaming API の深掘り調査

**目的**: `stream()` と `streamVNext()` の違いを実際に確認し、最適な実装方法を見極める

#### 1. 動作確認とログ分析

1. **現在の `stream()` 実装をテスト**
   - Workflow を実行してコンソールログを確認
   - どのようなチャンクが流れているか記録
   - エラーが発生していないか確認

2. **`streamVNext()` との比較**
   - 一時的に `streamVNext()` に戻してテスト
   - ログの違いを比較
   - どちらがより多くの情報を提供するか確認

3. **ドキュメント再確認**
   - Context7で Mastra の stream API のドキュメントを再度確認
   - 公式の推奨実装パターンを調査
   - コミュニティでの使用例を探す

#### 2. `writer.write()` のカスタムイベント調査

1. **Workflow内のカスタムイベントが流れているか確認**
   - `/src/mastra/workflows/test-workflow.ts` の `writer.write()` が正しく動作しているか
   - SSE形式に変換されているか
   - フロントエンドで受信できているか

2. **ストリーミングイベントの種類を整理**
   - Mastra が自動的に送るイベント
   - `writer.write()` のカスタムイベント
   - 各イベントの構造を文書化

#### 3. 実装の最適化

1. **最適なストリーミングAPIを選択**
   - `stream()` vs `streamVNext()` の結論を出す
   - 選択理由を know-how.md に記録

2. **エラーハンドリングの改善**
   - タイムアウトエラーへの対処
   - ストリーム中断時の処理
   - リトライロジックの実装

3. **パフォーマンス最適化**
   - 不要なログの削減
   - バッファリングの最適化
   - メモリ使用量の監視

---

### 🎯 次のタスク: `useCoAgentStateRender` でリアルタイムストリーミングUI実装

**注意**: ストリーミングAPIの調査が完了してから実装すること

**参考ドキュメント**:
- **know-how.md 806-908行目**: `useCoAgentStateRender` の実装例
- **CLAUDE.md 214-244行目**: リアルタイムストリーミングUIの問題と解決策

#### 実装手順

1. **Backend: CoAgentの作成**
   - 新しいAgent（例: `workflowAgent`）を作成
   - Agentの状態型を定義:
     ```typescript
     type WorkflowState = {
       currentStep: string;
       completedSteps: string[];
       eventLog: Array<{ timestamp: string; type: string; message: string; }>;
       progress: number;
     };
     ```
   - Workflow実行時に状態を更新するToolを実装
   - ファイル: `/src/mastra/agents/index.ts`

2. **Backend: Workflow Tool の実装**
   - Workflowを呼び出すToolを作成
   - Workflowのイベントごとに `agent.setState()` で状態更新
   - ファイル: `/src/mastra/tools/index.ts`

3. **Frontend: `useCoAgentStateRender` の実装**
   - `useCoAgentStateRender<WorkflowState>` を追加
   - Backend の状態変化をリアルタイムでUIに反映
   - カスタムUIコンポーネントで見た目を制御
   - ファイル: `/src/app/page.tsx`

4. **Suggestion の追加**
   - 新しいアクションをsuggestions配列に追加
   - 例: "Run Workflow (CoAgent State)"

#### 重要ポイント

- **なぜ `useCoAgentStateRender` が動作するのか**（know-how.md 896-908行目参照）:
  1. Backend側で状態を更新
  2. Frontend側で `state` パラメータが変化
  3. `render` 関数の入力値が変わるため確実に再レンダリング

- **既存コードとの違い**:
  - 既存の `callWorkflowDirectly` / `callWorkflowWithAppendMessage` は残す
  - 新しい方法として `useCoAgentStateRender` を追加

---

## 参考情報

### ファイル構成

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
│   ├── page.tsx                  # 既存: callWorkflowDirectly (155-314行目)
│   │                             # 既存: callWorkflowWithAppendMessage (316-417行目)
│   │                             # 今後: useCoAgentStateRender追加
│   └── api/
│       ├── agents/[agentName]/
│       │   ├── generate/route.ts # Agent generate API
│       │   └── stream/route.ts   # Agent stream API
│       └── workflows/[workflowName]/
│           └── stream/route.ts   # Workflow stream API (stream()使用)
```

### 既存のWorkflow実装

- **Workflow定義**: `/src/mastra/workflows/test-workflow.ts`
  - step1: 開始時に `writer.write()` で進捗書き込み
  - step2: 終了時に `writer.write()` で進捗書き込み

- **Workflow API**: `/src/app/api/workflows/[workflowName]/stream/route.ts`
  - **変更後**: `run.stream()` でストリーミング（`{ stream, getWorkflowState }` 取得）
  - SSE形式でイベント送信
  - 最終状態を `await getWorkflowState()` で取得

### 調査結果の参照先

1. **Generative UI全般**: know-how.md 705-977行目
2. **`useCoAgentStateRender` の詳細**: know-how.md 806-908行目
3. **appendMessageの制限**: know-how.md 912-963行目
4. **実装方法の比較表**: know-how.md 969-977行目

---

## 注意事項

- 既存の `callWorkflowDirectly` と `callWorkflowWithAppendMessage` は削除しない
- 3つの実装方法を並列で比較できるようにする
- `useCoAgentStateRender` が最も推奨される方法だが、学習のため全パターンを残す

---

## 次セッションで最初にやること

### まず優先: Streaming API の調査

1. **このTODO.mdを読む**
2. **現在の `stream()` 実装をテスト実行**
   - ブラウザで Workflow を実行
   - コンソールログを確認（サーバー・クライアント両方）
   - エラーや警告がないか確認
3. **ログを分析して know-how.md に記録**
   - どのようなイベントが流れているか
   - `writer.write()` のカスタムイベントが見えているか
   - `stream()` の挙動を文書化
4. **必要に応じて `streamVNext()` と比較**
   - 一時的に戻してテスト
   - 違いを明確化

### その後: Generative UI 実装（調査完了後）

1. know-how.md 806-908行目の実装例を確認
2. Backend側で `workflowAgent` を作成
3. Workflow実行Toolで状態を更新
4. Frontend側で `useCoAgentStateRender` を実装

---

## 重要な学び（2025-11-14）

### MastraClient の baseUrl について

- **MastraClient は自動的に `/api/` を追加する**
- `baseUrl: '/api/mastra'` とすると `/api/mastra/api/agents/...` と重複する
- **正解**: `baseUrl: window.location.origin` （サーバールートを指定）
- Mastra 標準の API 構造: `{baseUrl}/api/agents/...`, `{baseUrl}/api/workflows/...`

### stream() vs streamVNext()

- **`stream()`**: 返り値 `{ stream, getWorkflowState }`
  - `stream`: イベントのストリーム
  - `getWorkflowState()`: 最終状態を取得する関数

- **`streamVNext()`**: 返り値がストリーム自体（追加プロパティ付き）
  - `stream.result`: 最終結果のプロミス
  - `stream.status`: ステータスのプロミス
  - `stream.usage`: トークン使用量のプロミス
  - `stream.traceId`: オプションのトレースID
  - 直接イテレート可能（`for await (const chunk of stream)`）

- **現在の選択**: `stream()` を使用中
- **次の調査**: 実際に動作確認して最適な方を選ぶ
