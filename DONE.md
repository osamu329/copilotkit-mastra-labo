# 完了したタスク

このファイルには、完了したタスクを記録しています。現在進行中のタスクは [TODO.md](./TODO.md) を参照してください。

---

## 2025-11-14

### Workflow Streaming API の徹底調査

**実施内容:**
- `stream()` と `streamVNext()` を実際にテストして比較
- カスタムイベントのサポート状況を確認
- 実測値を詳細にコメントで記録

**結論:**
- ✅ **`streamVNext()` 推奨**（カスタムイベント対応）
- ❌ `stream()` はカスタムイベント非対応
- `writer.write()` のイベントは `workflow-step-output` で受信可能

**詳細:** [know-how/workflow-streaming-api.md](./know-how/workflow-streaming-api.md)

**コミット:**
- `2c0242a`: Streaming API詳細調査とドキュメント化
- `0ad67ea`: ライブラリ調査の優先順位ルールを追加
- `f736ff6`: status=complete バグのドキュメント化

---

### Workflow UI 問題の原因分析

**問題1: リアルタイム更新されない**
- **原因:** `useCopilotAction` の render は handler 実行中に再レンダリングされない
- **解決策:** `useCoAgentStateRender` を使用（Backend 状態管理）

**問題2: status="complete" なのに「実行中」と表示**
- **原因:** setState は非同期、handler return 時にはまだ反映されていない
- **解決策:** status を最優先して表示ロジックを変更

**詳細:** [know-how/workflow-ui-issues.md](./know-how/workflow-ui-issues.md)

---

### ドキュメント構造の再編成

**実施内容:**
- know-how.md (1665行) を 7つのセクションファイルに分割
- index.md に過不足ないサマリを作成
- CLAUDE.md にドキュメント管理方針を追加

**効果:**
- ✅ セクション単位で情報を探しやすく
- ✅ index.md で全体像を素早く把握
- ✅ 大きなファイルの読み込み負荷を軽減

**コミット:** `7f5657b`: know-howをディレクトリ構造に再編成

---

### ライブラリ調査の優先順位ルール確立

**背景:**
- WebFetch を使ってライブラリ調査しようとした
- context7 エージェントの存在を忘れていた

**対策:**
- CLAUDE.md に「🔍 ライブラリ調査の優先順位【重要】」セクションを追加
- 優先度1: Context7 エージェント（最優先）
- 優先度2: WebSearch
- 優先度3: WebFetch

**コミット:** `0ad67ea`

---

### API ルート構造の変更

**実施内容:**
- `/api/mastra/agents` → `/api/agents` に変更
- `/api/mastra/workflows` → `/api/workflows` に変更
- MastraClient の baseUrl を修正（自動的に `/api/` を追加するため）

**コミット:** `b288ad7`

---

### Generative UI に関する調査完了

**実施内容:**
- `useCoAgentStateRender` がリアルタイムストリーミング UI に最適と判明
- 5つの実装方法を整理（`useCopilotAction`, `renderAndWaitForResponse`, `useFrontendTool`, `useCoAgentStateRender`, `useRenderToolCall`）

**詳細:** [know-how/generative-ui.md](./know-how/generative-ui.md)

---

### appendMessage 版の Workflow Action 実装

**実施内容:**
- `callWorkflowWithAppendMessage` Action を追加
- ファイル: `/src/app/page.tsx` (316-417行目)

**結果:**
- ✅ リアルタイム表示は成功
- ❌ 見た目のカスタマイズ不可

---

### エンドポイントの分離

**実施内容:**
- Agent generate/stream を専用ルートに分離
- Workflow stream を専用ルートに分離
- 未使用の `[...path]/route.ts` を削除

---

## 過去のタスク（詳細は省略）

### Sub-Agent 可視化の試行錯誤
- `writer.write()` でのカスタムメッセージ送信（動作しない理由を解明）
- `stream.textStream.pipeTo(writer)` でのストリーミング（制限事項を確認）
- `useCopilotAction` の `render` での可視化（推奨方法として確立）

**詳細:** [know-how/sub-agent-visualization.md](./know-how/sub-agent-visualization.md)

---

### Sub-Agent の設定方法確立
- `description` プロパティの重要性を確認
- `.network()` メソッドの使用方法
- Mastra インスタンスへの登録方法
- Tool 経由での呼び出し方法

**詳細:** [know-how/sub-agent-setup.md](./know-how/sub-agent-setup.md)

---

### フロントエンドから直接 Agent をストリーミング呼び出し
- MastraClient を使った Agent の直接呼び出し
- SSE形式のストリーミング実装
- `processDataStream` の正しい使い方
- 複数回呼び出しの独立したステート管理

**詳細:** [know-how/frontend-agent-streaming.md](./know-how/frontend-agent-streaming.md)

---

### フロントエンドから直接 Workflow をストリーミング呼び出し
- Workflow の定義と `writer.write()` の使用
- API Route の分離（agents / workflows）
- `run.streamVNext()` を使ったストリーミング
- Workflow イベントのリアルタイム表示

**詳細:** [know-how/frontend-workflow-streaming.md](./know-how/frontend-workflow-streaming.md)
