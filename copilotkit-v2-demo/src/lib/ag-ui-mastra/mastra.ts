import type {
  AgentConfig,
  BaseEvent,
  RunAgentInput,
  RunFinishedEvent,
  RunStartedEvent,
  StateSnapshotEvent,
  TextMessageChunkEvent,
  ToolCallArgsEvent,
  ToolCallEndEvent,
  ToolCallResultEvent,
  ToolCallStartEvent,
} from "@ag-ui/client";
import { AbstractAgent, EventType } from "@ag-ui/client";
import type { StorageThreadType } from "@mastra/core/memory";
import { Agent as LocalMastraAgent } from "@mastra/core/agent";
import { RequestContext } from "@mastra/core/request-context";
import { randomUUID } from "crypto";
import { Observable } from "rxjs";
import { MastraClient } from "@mastra/client-js";
type RemoteMastraAgent = ReturnType<MastraClient["getAgent"]>;
import {
  convertAGUIMessagesToMastra,
  GetLocalAgentsOptions,
  getLocalAgents,
  getRemoteAgents,
  GetRemoteAgentsOptions,
  GetLocalAgentOptions,
  getLocalAgent,
} from "./utils";

export interface MastraAgentConfig extends AgentConfig {
  agent: LocalMastraAgent | RemoteMastraAgent;
  resourceId?: string;
  requestContext?: RequestContext;
}

interface MastraAgentStreamOptions {
  onTextPart?: (text: string) => void;
  onFinishMessagePart?: () => void;
  onToolCallPart?: (streamPart: { toolCallId: string; toolName: string; args: any }) => void;
  onToolResultPart?: (streamPart: { toolCallId: string; result: any }) => void;
  onError?: (error: Error) => void;
  onRunFinished?: () => Promise<void>;
}

export class MastraAgent extends AbstractAgent {
  agent: LocalMastraAgent | RemoteMastraAgent;
  resourceId?: string;
  requestContext?: RequestContext;
  private seenEventTypes = new Set<string>();
  private seenChunkTypes = new Set<string>();

  constructor({ agent, resourceId, requestContext, ...rest }: MastraAgentConfig) {
    super(rest);
    this.agent = agent;
    this.resourceId = resourceId;
    this.requestContext = requestContext ?? new RequestContext();
  }

  clone(): MastraAgent {
    const cloned = super.clone() as MastraAgent;
    cloned.agent = this.agent;
    cloned.resourceId = this.resourceId;
    cloned.requestContext = this.requestContext;
    cloned.seenEventTypes = new Set<string>();
    cloned.seenChunkTypes = new Set<string>();
    return cloned;
  }

  private logEventType(type: string) {
    if (!this.seenEventTypes.has(type)) {
      this.seenEventTypes.add(type);
      console.log(`📡 [ag-ui event] ${type}`);
    }
  }

  private logChunkType(type: string) {
    if (!this.seenChunkTypes.has(type)) {
      this.seenChunkTypes.add(type);
      console.log(`📦 [mastra chunk] ${type}`);
    }
  }

  run(input: RunAgentInput): Observable<BaseEvent> {
    let messageId = randomUUID();
    this.seenEventTypes.clear();
    this.seenChunkTypes.clear();

    return new Observable<BaseEvent>((subscriber) => {
      const originalNext = subscriber.next.bind(subscriber);
      subscriber.next = (event: BaseEvent) => {
        this.logEventType(event.type);
        return originalNext(event);
      };

      const run = async () => {
        const runStartedEvent: RunStartedEvent = {
          type: EventType.RUN_STARTED,
          threadId: input.threadId,
          runId: input.runId,
        };

        subscriber.next(runStartedEvent);

        // Handle local agent memory management (from Mastra implementation)
        if (this.isLocalMastraAgent(this.agent)) {
          const memory = await this.agent.getMemory();

          if (memory && input.state && Object.keys(input.state || {}).length > 0) {
            let thread: StorageThreadType | null = await memory.getThreadById({
              threadId: input.threadId,
            });

            if (!thread) {
              thread = {
                id: input.threadId,
                title: "",
                metadata: {},
                resourceId: this.resourceId ?? input.threadId,
                createdAt: new Date(),
                updatedAt: new Date(),
              };
            }

            const existingMemory = JSON.parse((thread.metadata?.workingMemory as string) ?? "{}");
            const { messages, ...rest } = input.state;
            const workingMemory = JSON.stringify({ ...existingMemory, ...rest });

            // Update thread metadata with new working memory
            await memory.saveThread({
              thread: {
                ...thread,
                metadata: {
                  ...thread.metadata,
                  workingMemory,
                },
              },
            });
          }
        }

        try {
          await this.streamMastraAgent(input, {
            onTextPart: (text) => {
              const event: TextMessageChunkEvent = {
                type: EventType.TEXT_MESSAGE_CHUNK,
                role: "assistant",
                messageId,
                delta: text,
              };
              subscriber.next(event);
            },
            onToolCallPart: (streamPart) => {
              const startEvent: ToolCallStartEvent = {
                type: EventType.TOOL_CALL_START,
                parentMessageId: messageId,
                toolCallId: streamPart.toolCallId,
                toolCallName: streamPart.toolName,
              };
              subscriber.next(startEvent);

              // Fix: Use empty object for undefined args (tools with no parameters)
              const argsToSend = streamPart.args ?? {};
              const argsEvent: ToolCallArgsEvent = {
                type: EventType.TOOL_CALL_ARGS,
                toolCallId: streamPart.toolCallId,
                delta: JSON.stringify(argsToSend),
              };
              subscriber.next(argsEvent);

              const endEvent: ToolCallEndEvent = {
                type: EventType.TOOL_CALL_END,
                toolCallId: streamPart.toolCallId,
              };
              subscriber.next(endEvent);
            },
            onToolResultPart(streamPart) {
              const toolCallResultEvent: ToolCallResultEvent = {
                type: EventType.TOOL_CALL_RESULT,
                toolCallId: streamPart.toolCallId,
                content: JSON.stringify(streamPart.result),
                messageId: randomUUID(),
                role: "tool",
              };

              subscriber.next(toolCallResultEvent);
            },
            onFinishMessagePart: async () => {
              messageId = randomUUID();
            },
            onError: (error) => {
              console.error("error", error);
              // Handle error
              subscriber.error(error);
            },
            onRunFinished: async () => {
              if (this.isLocalMastraAgent(this.agent)) {
                try {
                  const memory = await this.agent.getMemory();
                  if (memory) {
                    const workingMemory = await memory.getWorkingMemory({
                      threadId: input.threadId,
                      memoryConfig: {
                        workingMemory: {
                          enabled: true,
                        },
                      },
                    });

                    if (typeof workingMemory === "string") {
                      const snapshot = JSON.parse(workingMemory);

                      if (snapshot && !("$schema" in snapshot)) {
                        const stateSnapshotEvent: StateSnapshotEvent = {
                          type: EventType.STATE_SNAPSHOT,
                          snapshot,
                        };

                        subscriber.next(stateSnapshotEvent);
                      }
                    }
                  }
                } catch (error) {
                  console.error("Error sending state snapshot", error);
                }
              }

              // Emit run finished event
              subscriber.next({
                type: EventType.RUN_FINISHED,
                threadId: input.threadId,
                runId: input.runId,
              } as RunFinishedEvent);

              // Complete the observable
              subscriber.complete();
            },
          });
        } catch (error) {
          console.error("Stream error:", error);
          subscriber.error(error);
        }
      };

      run();

      return () => {};
    });
  }

  isLocalMastraAgent(agent: LocalMastraAgent | RemoteMastraAgent): agent is LocalMastraAgent {
    return "getMemory" in agent;
  }

  /**
   * Streams in process or remote mastra agent.
   */
  private async streamMastraAgent(
    { threadId, runId, messages, tools, context: inputContext }: RunAgentInput,
    {
      onTextPart,
      onFinishMessagePart,
      onToolCallPart,
      onToolResultPart,
      onError,
      onRunFinished,
    }: MastraAgentStreamOptions,
  ): Promise<void> {
    const clientTools = tools.reduce(
      (acc, tool) => {
        acc[tool.name as string] = {
          id: tool.name,
          description: tool.description,
          inputSchema: tool.parameters,
        };
        return acc;
      },
      {} as Record<string, any>,
    );
    const resourceId = this.resourceId ?? threadId;

    const convertedMessages = convertAGUIMessagesToMastra(messages);
    this.requestContext?.set("ag-ui", { context: inputContext });
    const requestContext = this.requestContext;

    if (this.isLocalMastraAgent(this.agent)) {
      // Local agent - use the agent's stream method directly
      try {
        const response = await this.agent.stream(convertedMessages, {
          memory: { thread: threadId, resource: resourceId },
          runId,
          clientTools,
          requestContext,
        });

        // fullStream is a ReadableStream - use getReader()
        const reader = response.fullStream.getReader();
        try {
          while (true) {
            const { done, value: chunk } = await reader.read();
            if (done) break;

            this.logChunkType(chunk.type);

            if (chunk.type.startsWith("data-")) {
              console.log(`📦 [mastra data chunk] ${chunk.type}:`, JSON.stringify((chunk as any).data));
            }

            switch (chunk.type) {
              case "text-delta": {
                onTextPart?.(chunk.payload.text);
                break;
              }
              case "tool-call": {
                onToolCallPart?.({
                  toolCallId: chunk.payload.toolCallId,
                  toolName: chunk.payload.toolName,
                  args: chunk.payload.args,
                });
                break;
              }
              case "tool-result": {
                onToolResultPart?.({
                  toolCallId: chunk.payload.toolCallId,
                  result: chunk.payload.result,
                });
                break;
              }

              case "error": {
                onError?.(new Error(chunk.payload.error as string));
                break;
              }

              case "finish": {
                onFinishMessagePart?.();
                break;
              }
            }
          }
        } finally {
          reader.releaseLock();
        }

        await onRunFinished?.();
      } catch (error) {
        onError?.(error as Error);
      }
    } else {
      // Remote agent - use the remote agent's stream method
      try {
        const response = await this.agent.stream(convertedMessages, {
          threadId,
          resourceId,
          runId,
          clientTools,
        });

        // Remote agents should have a processDataStream method
        if (response && typeof response.processDataStream === "function") {
          await response.processDataStream({
            onChunk: async (chunk: any) => {
              this.logChunkType(chunk.type);
              switch (chunk.type) {
                case "text-delta": {
                  onTextPart?.(chunk.payload.text);
                  break;
                }
                case "tool-call": {
                  onToolCallPart?.({
                    toolCallId: chunk.payload.toolCallId,
                    toolName: chunk.payload.toolName,
                    args: chunk.payload.args,
                  });
                  break;
                }
                case "tool-result": {
                  onToolResultPart?.({
                    toolCallId: chunk.payload.toolCallId,
                    result: chunk.payload.result,
                  });
                  break;
                }

                case "finish": {
                  onFinishMessagePart?.();
                  break;
                }
              }
            },
          });
          await onRunFinished?.();
        } else {
          throw new Error("Invalid response from remote agent");
        }
      } catch (error) {
        onError?.(error as Error);
      }
    }
  }

  static async getRemoteAgents(
    options: GetRemoteAgentsOptions,
  ): Promise<Record<string, AbstractAgent>> {
    return getRemoteAgents(options);
  }

  static getLocalAgents(options: GetLocalAgentsOptions): Record<string, AbstractAgent> {
    return getLocalAgents(options);
  }

  static getLocalAgent(options: GetLocalAgentOptions) {
    return getLocalAgent(options);
  }
}
