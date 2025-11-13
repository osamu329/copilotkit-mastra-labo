# Mastra + CopilotKit 開発ノウハウ

このディレクトリには、Mastra と CopilotKit を統合したアプリケーション開発の試行錯誤と学びがまとめられています。

## 📋 目次

1. [Sub-Agent 可視化の試行錯誤](#1-sub-agent-可視化の試行錯誤)
2. [Sub-Agent の設定方法](#2-sub-agent-の設定方法)
3. [Agent の直接ストリーミング呼び出し](#3-agent-の直接ストリーミング呼び出し)
4. [Workflow の直接ストリーミング呼び出し](#4-workflow-の直接ストリーミング呼び出し)
5. [Generative UI の実装方法](#5-generative-ui-の実装方法)
6. [Workflow Streaming API 詳細調査](#6-workflow-streaming-api-詳細調査)
7. [Workflow UI の問題とトラブルシューティング](#7-workflow-ui-の問題とトラブルシューティング)

---

## 1. Sub-Agent 可視化の試行錯誤

**要点:**
- CopilotKit は Mastra の `writer.write()` や `pipeTo()` を UI に直接反映しない
- リアルタイムストリーミング表示には `useCopilotAction` の `render` 関数を使う必要がある

**推奨される方法:**
- ✅ `useCopilotAction` の `render` 関数で `status` と `result` を監視
- ✅ `processDataStream({ onChunk })` でイベントを受け取り、useState で状態管理
- ❌ `writer.write()` でカスタムメッセージ送信（UI に反映されない）
- ❌ `stream.textStream.pipeTo(writer)` でリアルタイム表示（完了後にまとめて表示される）

**重要な発見:**
- CopilotKit は「ツールの実行状態」は表示するが「ツール内部のストリーミング」は表示しない
- Mastra の writer は実行されているが、CopilotKit の UI には届かない
- ストリーミング対応には Frontend 側でのカスタム実装が必要

**詳細:** [sub-agent-visualization.md](./sub-agent-visualization.md)

---

## 2. Sub-Agent の設定方法

**要点:**
- Sub-Agent を正しく動作させるには、`description` プロパティ、Mastra インスタンスへの登録、Tool での呼び出し方法が重要

**推奨される方法:**
- ✅ `description` プロパティで役割を明確に記述（必須）
- ✅ Mastra インスタンスの `agents` に登録（キー名でアクセス）
- ✅ Tool から `mastra?.getAgent('キー名')` で取得
- ❌ `mastra?.getAgent('Agent Name')` は動作しない（name プロパティではない）

**重要な発見:**
- `description` は LLM が sub-agent を選択する際の判断材料
- `.network()` メソッドで親エージェントに sub-agent を追加できる
- エラーメッセージから正しいキー名を確認できる

**詳細:** [sub-agent-setup.md](./sub-agent-setup.md)

---

## 3. Agent の直接ストリーミング呼び出し

**要点:**
- MastraClient を使って Frontend から Agent を直接呼び出し、リアルタイムストリーミング表示が可能

**推奨される方法:**
- ✅ `MastraClient` で `agent.stream()` を呼び出し
- ✅ `processDataStream({ onChunk })` でイベントを処理
- ✅ API Route で SSE 形式（`data: {json}\n\n`）に変換
- ✅ `actionExecutionId` で複数回呼び出しの状態を独立管理

**重要な発見:**
- MastraClient の `baseUrl` は `window.location.origin` を指定（自動的に `/api/` が追加される）
- `baseUrl: '/api/mastra'` とすると `/api/mastra/api/agents/...` と重複する
- `text-delta` イベントで部分的なテキストを受信し、`setStreamingStates` で更新すると UI に反映される

**詳細:** [frontend-agent-streaming.md](./frontend-agent-streaming.md)

---

## 4. Workflow の直接ストリーミング呼び出し

**要点:**
- Workflow も Frontend から直接呼び出し可能だが、API Route の設計が異なる
- vNext API (`run.streamVNext()`) の使用が必須

**推奨される方法:**
- ✅ `run.streamVNext()` で Workflow を実行（カスタムイベント対応）
- ✅ `writer.write()` でカスタムイベントを送信
- ✅ `.then()` でステップをチェーン（vNext API）
- ❌ `.step()` は Legacy API（使用不可）
- ❌ `run.stream()` はカスタムイベント非対応

**重要な発見:**
- Workflow は Agent とは別の API Route (`/api/workflows/...`)
- `for await (const chunk of stream)` でイベントを直接イテレート
- `writer.write()` のイベントも含めて全イベントがストリームされる
- SSE 形式への変換が必要

**詳細:** [frontend-workflow-streaming.md](./frontend-workflow-streaming.md)

---

## 5. Generative UI の実装方法

**要点:**
- CopilotKit は AI がカスタム React コンポーネントを生成・表示できる Generative UI を提供
- リアルタイムストリーミング UI には `useCoAgentStateRender` が最適

**実装方法一覧:**

| 方法 | 用途 | リアルタイム対応 |
|------|------|-----------------|
| `useCopilotAction` + `render` | 基本的なツールUI | ❌ (status/args変化時のみ) |
| `renderAndWaitForResponse` | ユーザー入力待ち（HITL） | ❌ |
| `useFrontendTool` | 非同期処理+UI | ❌ |
| `useCoAgentStateRender` | **リアルタイムストリーミング** | ✅ |
| `useRenderToolCall` | レンダリング専用 | ❌ |

**推奨される方法:**
- ✅ `useCoAgentStateRender` でリアルタイムストリーミング UI
- ✅ Backend 側で Agent の状態を更新
- ✅ Frontend 側で `state` の変化を監視
- ❌ handler 内の `setState` では再レンダリングされない
- ❌ `flushSync` も効果なし

**重要な発見:**
- `render` 関数は `status` や `args` が変わらないと再レンダリングされない
- `useCoAgentStateRender` は Backend の状態変化で自動再レンダリング
- `appendMessage` は動作するが見た目のカスタマイズ不可

**詳細:** [generative-ui.md](./generative-ui.md)

---

## 6. Workflow Streaming API 詳細調査

**要点:**
- Mastra の `stream()` と `streamVNext()` を実際にテストし、カスタムイベントのサポート状況を確認

**テスト結果:**

| API | カスタムイベント | 追加メタデータ | 推奨度 |
|-----|-----------------|---------------|--------|
| `stream()` | ❌ 非対応 | getWorkflowState() のみ | ❌ |
| `streamVNext()` | ✅ workflow-step-output で送信 | result, status, usage | ✅ |

**推奨される方法:**
- ✅ `run.streamVNext()` を使用（カスタムイベント対応）
- ✅ `workflow-step-output` イベントで `writer.write()` の内容を受信
- ✅ `from: 'USER'` でカスタムイベント判別
- ❌ `run.stream()` はカスタムイベント非対応

**重要な発見:**
- VNext API は `workflow-step-output` タイプでカスタムイベントを送信
- カスタムイベントは `chunk.payload.output` からアクセス可能
- Legacy API は基本的なワークフローイベントのみ（step-start, step-result, finish）
- 両 API とも traceId は undefined（追加設定が必要？）

**詳細:** [workflow-streaming-api.md](./workflow-streaming-api.md) の 1-395行目

---

## 7. Workflow UI の問題とトラブルシューティング

**要点:**
- Workflow 実行中の UI リアルタイム更新問題と `status="complete"` 時の表示問題

**問題1: リアルタイム更新されない**
- **原因:** `useCopilotAction` の `render` は handler 実行中に再レンダリングされない
- **Agent との違い:** Agent は `processDataStream` のコールバックで再レンダリング可能
- **解決策:** `useCoAgentStateRender` を使用（Backend 状態管理）

**問題2: status="complete" なのに「実行中」と表示**
- **原因:** `setState` は非同期、handler return 時にはまだ反映されていない
- **render のロジック:** `workflowState.events.length === 0` のみで判断（status 無視）
- **解決策:** `status` を最優先して表示ロジックを変更

**推奨される方法:**
- ✅ `status === "complete"` なら完了と表示
- ✅ `result` を表示して最終結果を明示
- ✅ `status` は CopilotKit が管理する信頼できる値
- ❌ ユーザー管理の状態（useState）のみで判断しない

**その他のトラブルシューティング:**
- Anthropic API タイムアウトエラー → vLLM の `/v1/chat/completions` エンドポイント追加
- CopilotKit サイドバー → `defaultOpen={true}` で最初から開く
- Suggestion の追加 → instructions で「/で始まるコマンドではない」と明記

**詳細:** [workflow-ui-issues.md](./workflow-ui-issues.md)

---

## 🔗 参考リンク

- [Mastra Tool Streaming Documentation](https://github.com/mastra-ai/mastra/blob/main/docs/src/content/en/docs/streaming/tool-streaming.mdx)
- [CopilotKit useCopilotAction Reference](https://docs.copilotkit.ai/reference/hooks/useCopilotAction)
- [CopilotKit Generative UI Guide](https://docs.copilotkit.ai/concepts/generative-ui)

---

## 📝 更新履歴

- 2025-11-14: 初版作成、know-how.md をセクション分割
- 2025-11-14: Workflow Streaming API 詳細調査完了
- 2025-11-14: Workflow UI 問題の原因と解決策を記載
