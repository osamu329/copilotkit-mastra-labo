# TODO: Generative UI実装（次セッション引き継ぎ）

## 現状まとめ

### 完了した作業

1. ✅ **Generative UIに関する調査完了**
   - `useCoAgentStateRender` がリアルタイムストリーミングUIに最適と判明
   - 5つの実装方法を整理（`useCopilotAction`, `renderAndWaitForResponse`, `useFrontendTool`, `useCoAgentStateRender`, `useRenderToolCall`）
   - 詳細は **know-how.md の「🎨 Generative UI の深掘り調査」セクション** を参照

2. ✅ **ドキュメント更新完了**
   - **CLAUDE.md**: 「🎨 Generative UI の実装方法」セクションを追加（193行目〜）
   - **know-how.md**: 「🎨 Generative UI の深掘り調査」セクションを追加（705行目〜）

3. ✅ **appendMessage版のWorkflow Action実装**
   - `callWorkflowWithAppendMessage` Action を追加済み
   - ファイル: `/src/app/page.tsx` (316-417行目)
   - リアルタイム表示は成功したが、見た目のカスタマイズ不可

### 現在の問題

**Workflowストリーミングイベントのリアルタイム表示がうまくいかない**

試した方法：
1. ❌ `render` + `useState` → 再レンダリングされない（`status`/`args`が変わらないため）
2. ❌ `flushSync` → 効果なし（同期ループでブロック）
3. ✅ `appendMessage` → 動作するが見た目カスタマイズ不可

---

## 次にやること

### 🎯 主タスク: `useCoAgentStateRender` でリアルタイムストリーミングUI実装

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
│       └── mastra/
│           └── workflows/[...path]/route.ts  # Workflow API
```

### 既存のWorkflow実装

- **Workflow定義**: `/src/mastra/workflows/test-workflow.ts`
  - step1: 開始時に `writer.write()` で進捗書き込み
  - step2: 終了時に `writer.write()` で進捗書き込み

- **Workflow API**: `/src/app/api/mastra/workflows/[...path]/route.ts`
  - `run.streamVNext()` でストリーミング
  - SSE形式でイベント送信

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

1. このTODO.mdを読む
2. know-how.md 806-908行目の実装例を確認
3. Backend側で `workflowAgent` を作成
4. Workflow実行Toolで状態を更新
5. Frontend側で `useCoAgentStateRender` を実装
