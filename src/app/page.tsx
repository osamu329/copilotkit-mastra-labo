"use client";

import { ProverbsCard } from "@/components/proverbs";
import { WeatherCard } from "@/components/weather";
import { MoonCard } from "@/components/moon";
import { AgentState } from "@/lib/types";
import { useCoAgent, useCopilotAction, useCopilotChat } from "@copilotkit/react-core";
import { CopilotKitCSSProperties, CopilotSidebar } from "@copilotkit/react-ui";
import { useState } from "react";
import { flushSync } from "react-dom";
import { MastraClient } from "@mastra/client-js";
import { TextMessage } from "@copilotkit/runtime-client-gql";
import { MessageRole } from "@copilotkit/runtime-client-gql";

export default function CopilotKitPage() {
  const [themeColor, setThemeColor] = useState("#6366f1");
  const { appendMessage } = useCopilotChat();

  // 🪁 Frontend Actions: https://docs.copilotkit.ai/mastra/frontend-actions
  useCopilotAction({
    name: "setThemeColor",
    parameters: [
      {
        name: "themeColor",
        description: "The theme color to set. Make sure to pick nice colors.",
        required: true,
      },
    ],
    handler({ themeColor }) {
      setThemeColor(themeColor);
    },
  });

  // 🤖 Frontend Tool: Call Sub Agent directly from frontend with streaming
  const [streamingState, setStreamingState] = useState<{ text: string; isStreaming: boolean }>({ text: "", isStreaming: false });

  // 🔄 Frontend Tool: Call Workflow directly from frontend with streaming
  const [workflowState, setWorkflowState] = useState<{ events: string[]; isStreaming: boolean }>({ events: [], isStreaming: false });

  useCopilotAction({
    name: "callSubAgentDirectly",
    description: "時刻に応じた適切な挨拶を直接subAgentに聞く（フロントエンドから）",
    parameters: [
      {
        name: "message",
        description: "subAgentに送るメッセージ",
        type: "string",
        required: true,
      },
    ],
    render: ({ args, status, result }) => {
      // 実行中、ストリーミング中、または完了時に表示
      if (status === "executing" || status === "complete" || streamingState.isStreaming || streamingState.text) {
        // 完了時は result を使用、それ以外はストリーミング中のテキスト
        const displayText = status === "complete" && result
          ? result
          : (streamingState.text || "⏳ 考えています...");

        return (
          <div style={{
            padding: "16px",
            borderRadius: "8px",
            backgroundColor: themeColor + "20",
            border: `2px solid ${themeColor}`,
            marginTop: "8px",
            marginBottom: "8px",
          }}>
            <div style={{ fontWeight: "bold", marginBottom: "8px" }}>
              🤖 subAgentからの応答
            </div>
            <div style={{ marginBottom: "8px", opacity: 0.8, fontSize: "0.9em" }}>
              質問: {args.message}
            </div>
            <div style={{
              marginTop: "12px",
              padding: "12px",
              backgroundColor: "white",
              borderRadius: "4px",
              minHeight: "60px",
            }}>
              {displayText}
              {streamingState.isStreaming && <span className="animate-pulse">▊</span>}
            </div>
          </div>
        );
      }
      return <></>;
    },
    handler: async ({ message }) => {
      try {
        // ステートを初期化
        setStreamingState({ text: "", isStreaming: true });

        // ブラウザ環境で動的にMastraClientを初期化
        // NOTE: MastraClient automatically adds /api/ prefix
        const mastraClient = new MastraClient({
          baseUrl: window.location.origin,
        });

        const agent = mastraClient.getAgent("subAgent");
        console.log("🔵 Calling agent.stream...");
        const stream = await agent.stream({
          messages: [
            {
              role: "user",
              content: message,
            },
          ],
        });

        console.log("🔵 Stream object received:", stream);

        // Process the stream
        let fullText = "";

        console.log("🔵 Starting processDataStream...");
        await stream.processDataStream({
          onChunk: async (chunk) => {
            console.log("🔵 onChunk called:", chunk);

            if (chunk.type === 'text-delta') {
              fullText += chunk.payload.text;
              console.log("🔵 Text accumulated:", fullText);
              setStreamingState({ text: fullText, isStreaming: true });
            }
          },
        });

        console.log("🔵 Stream finished, fullText:", fullText);

        setStreamingState({ text: fullText, isStreaming: false });

        console.log("🔵 Returning fullText:", fullText);
        return fullText;
      } catch (error) {
        console.error("Error calling subAgent:", error);
        setStreamingState({ text: "", isStreaming: false });
        return "エラーが発生しました";
      }
    },
  });

  // 🔄 Workflow実行アクション
  useCopilotAction({
    name: "callWorkflowDirectly",
    description: "testWorkflowを直接呼び出してストリーミング表示する",
    parameters: [
      {
        name: "value",
        description: "Workflowに渡す初期値",
        type: "string",
        required: true,
      },
    ],
    render: ({ args, status, result }) => {
      if (status === "executing" || status === "complete" || workflowState.isStreaming || workflowState.events.length > 0) {
        return (
          <div style={{
            padding: "16px",
            borderRadius: "8px",
            backgroundColor: themeColor + "20",
            border: `2px solid ${themeColor}`,
            marginTop: "8px",
            marginBottom: "8px",
          }}>
            <div style={{ fontWeight: "bold", marginBottom: "8px" }}>
              🔄 Workflowからの応答
            </div>
            <div style={{ marginBottom: "8px", opacity: 0.8, fontSize: "0.9em" }}>
              入力値: {args.value}
            </div>
            <div style={{
              marginTop: "12px",
              padding: "12px",
              backgroundColor: "white",
              borderRadius: "4px",
              minHeight: "60px",
            }}>
              {status === "complete" && result && (
                <div style={{
                  marginBottom: "12px",
                  paddingBottom: "12px",
                  borderBottom: "2px solid #e5e7eb",
                  whiteSpace: "pre-wrap",
                  lineHeight: "1.6"
                }}>
                  {result}
                </div>
              )}
              {status === "executing" && workflowState.events.length === 0 && "⏳ 実行中..."}
              {workflowState.events.length > 0 && (
                <div>
                  <div style={{
                    fontWeight: "600",
                    marginBottom: "8px",
                    color: "#6b7280",
                    fontSize: "0.85em",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em"
                  }}>
                    📋 実行ログ:
                  </div>
                  {workflowState.events.map((event, idx) => (
                    <div key={idx} style={{
                      marginBottom: "6px",
                      fontSize: "0.9em",
                      paddingLeft: "8px",
                      borderLeft: "3px solid #e5e7eb",
                      lineHeight: "1.6"
                    }}>
                      {event}
                    </div>
                  ))}
                </div>
              )}
              {workflowState.isStreaming && <span className="animate-pulse">▊</span>}
            </div>
          </div>
        );
      }
      return <></>;
    },
    handler: async ({ value }) => {
      try {
        setWorkflowState({ events: [], isStreaming: true });

        // Workflowを呼び出すためのfetch
        const response = await fetch(`${window.location.origin}/api/workflows/testWorkflow/stream`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            inputData: { value }
          }),
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const reader = response.body?.getReader();
        const decoder = new TextDecoder();

        if (!reader) {
          throw new Error("No response body");
        }

        let buffer = "";
        const events: string[] = [];

        while (true) {
          const { done, value: chunk } = await reader.read();

          if (done) break;

          buffer += decoder.decode(chunk, { stream: true });
          const lines = buffer.split("\n\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const data = line.slice(6);
              if (data === "[DONE]") {
                continue;
              }

              try {
                const eventData = JSON.parse(data);

                // イベントタイプに応じて表示を整形
                let displayText = "";
                if (eventData.type === "workflow-start") {
                  displayText = "🚀 Workflow開始";
                } else if (eventData.type === "workflow-step-start") {
                  displayText = `▶️ ${eventData.payload?.stepName || "step"}開始`;
                } else if (eventData.type === "workflow-step-output") {
                  // writer.write() のカスタムイベント
                  const output = eventData.payload?.output;
                  if (output?.type === "step-progress") {
                    displayText = `📝 ${output.message}`;
                  } else {
                    displayText = `📤 ${eventData.payload?.stepName} 出力`;
                  }
                } else if (eventData.type === "workflow-step-result") {
                  displayText = `✅ ${eventData.payload?.stepName || "step"}完了`;
                } else if (eventData.type === "workflow-finish") {
                  displayText = "🏁 Workflow完了";
                } else {
                  displayText = `📦 ${eventData.type}`;
                }

                if (displayText) {
                  events.push(displayText);

                  // ⭐ flushSyncで即座にUIを更新
                  flushSync(() => {
                    setWorkflowState({ events: [...events], isStreaming: true });
                  });
                }
              } catch (e) {
                console.error("Failed to parse event:", e);
              }
            }
          }
        }

        setWorkflowState({ events, isStreaming: false });

        // イベントの統計を計算
        const startEvents = events.filter(e => e.includes('開始')).length;
        const completeEvents = events.filter(e => e.includes('完了')).length;

        // 詳細なやりとりを result に含める
        const detailedResult = [
          `✅ Workflow実行完了: ${startEvents}ステップ実行、${completeEvents}ステップ完了`,
          '',
          '📋 実行ログ:',
          ...events.map((event, idx) => `${idx + 1}. ${event}`)
        ].join('\n');

        return detailedResult;
      } catch (error) {
        console.error("Error calling workflow:", error);
        setWorkflowState({ events: ["❌ エラーが発生しました"], isStreaming: false });
        return "エラーが発生しました";
      }
    },
  });

  // 🔄 Workflow実行アクション (appendMessage版)
  useCopilotAction({
    name: "callWorkflowWithAppendMessage",
    description: "testWorkflowを呼び出してチャットメッセージで進捗を表示する",
    parameters: [
      {
        name: "value",
        description: "Workflowに渡す初期値",
        type: "string",
        required: true,
      },
    ],
    handler: async ({ value }) => {
      try {
        // Workflowを呼び出すためのfetch
        const response = await fetch(`${window.location.origin}/api/workflows/testWorkflow/stream`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            inputData: { value }
          }),
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const reader = response.body?.getReader();
        const decoder = new TextDecoder();

        if (!reader) {
          throw new Error("No response body");
        }

        let buffer = "";

        while (true) {
          const { done, value: chunk } = await reader.read();

          if (done) break;

          buffer += decoder.decode(chunk, { stream: true });
          const lines = buffer.split("\n\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const data = line.slice(6);
              if (data === "[DONE]") {
                continue;
              }

              try {
                const eventData = JSON.parse(data);

                // イベントタイプに応じて表示を整形
                let displayText = "";
                if (eventData.type === "workflow-start") {
                  displayText = "🚀 Workflow開始";
                } else if (eventData.type === "workflow-step-start") {
                  displayText = `▶️ ${eventData.payload?.stepName || "step"}開始`;
                } else if (eventData.type === "workflow-step-output") {
                  const output = eventData.payload?.output;
                  if (output?.type === "step-progress") {
                    displayText = `📝 ${output.message}`;
                  } else {
                    displayText = `📤 ${eventData.payload?.stepName} 出力`;
                  }
                } else if (eventData.type === "workflow-step-result") {
                  displayText = `✅ ${eventData.payload?.stepName || "step"}完了`;
                } else if (eventData.type === "workflow-finish") {
                  displayText = "🏁 Workflow完了";
                }

                if (displayText) {
                  // appendMessageでチャットメッセージとして追加
                  await appendMessage(
                    new TextMessage({
                      role: MessageRole.Assistant,
                      content: displayText,
                    })
                  );

                  // イベントループに制御を戻す
                  await new Promise(resolve => setTimeout(resolve, 0));
                }
              } catch (e) {
                console.error("Failed to parse event:", e);
              }
            }
          }
        }

        return "Workflow実行完了";
      } catch (error) {
        console.error("Error calling workflow:", error);
        return "エラーが発生しました";
      }
    },
  });

  return (
    <main
      style={
        { "--copilot-kit-primary-color": themeColor } as CopilotKitCSSProperties
      }
    >
      <CopilotSidebar
        defaultOpen={true}
        disableSystemMessage={true}
        clickOutsideToClose={false}
        labels={{
          title: "Popup Assistant",
          initial: "👋 Hi, there! You're chatting with an agent.",
        }}
        suggestions={[
          {
            title: "Generative UI",
            message: "Get the weather in San Francisco.",
          },
          {
            title: "Frontend Tools",
            message: "Set the theme to green.",
          },
          {
            title: "Human In the Loop",
            message: "Please go to the moon.",
          },
          {
            title: "Write Agent State",
            message: "Add a proverb about AI.",
          },
          {
            title: "Update Agent State",
            message:
              "Please remove 1 random proverb from the list if there are any.",
          },
          {
            title: "Read Agent State",
            message: "What are the proverbs?",
          },
          {
            title: "Call Sub Agent",
            message: "サブエージェントを呼び出してお昼に適切な挨拶を教えてもらって",
          },
          {
            title: "Run Workflow",
            message: "testWorkflowを実行して「こんにちは」という値で動かして",
          },
          {
            title: "Run Workflow (appendMessage)",
            message: "callWorkflowWithAppendMessageを使って「こんにちは」という値でtestWorkflowを実行して",
          },
        ]}
      >
        <YourMainContent themeColor={themeColor} />
      </CopilotSidebar>
    </main>
  );
}

function YourMainContent({ themeColor }: { themeColor: string }) {
  // 🪁 Shared State: https://docs.copilotkit.ai/mastra/shared-state/in-app-agent-read
  const { state, setState } = useCoAgent<AgentState>({
    name: "weatherAgent",
    initialState: {
      proverbs: [
        "CopilotKit may be new, but its the best thing since sliced bread.",
      ],
    },
  });

  //🪁 Generative UI: https://docs.copilotkit.ai/mastra/generative-ui/tool-based
  useCopilotAction(
    {
      name: "weatherTool",
      description: "Get the weather for a given location.",
      available: "disabled",
      parameters: [{ name: "location", type: "string", required: true }],
      render: ({ args }) => {
        return <WeatherCard location={args.location} themeColor={themeColor} />;
      },
    },
    [themeColor],
  );

  // 🪁 Human In the Loop: https://docs.copilotkit.ai/mastra/human-in-the-loop
  useCopilotAction(
    {
      name: "go_to_moon",
      description: "Go to the moon on request.",
      renderAndWaitForResponse: ({ respond, status }) => {
        return (
          <MoonCard themeColor={themeColor} status={status} respond={respond} />
        );
      },
    },
    [themeColor],
  );

  return (
    <div
      style={{ backgroundColor: themeColor }}
      className="h-screen flex justify-center items-center flex-col transition-colors duration-300"
    >
      <ProverbsCard state={state} setState={setState} />
    </div>
  );
}
