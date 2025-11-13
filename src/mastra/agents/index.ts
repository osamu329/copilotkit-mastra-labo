import {anthropic} from "@ai-sdk/anthropic";
import { Agent } from "@mastra/core/agent";
import { weatherTool } from "@/mastra/tools";
import { LibSQLStore } from "@mastra/libsql";
import { z } from "zod";
import { Memory } from "@mastra/memory";

export const AgentState = z.object({
  proverbs: z.array(z.string()).default([]),
});

export const subAgent = new Agent({
  name: "Sub Agent",
  description: "現在の時刻を確認して適切な挨拶を日本語で返すエージェント",
  model: anthropic("claude-haiku-4-5"),
  instructions: "いまが朝か昼か夜かを確認してください。回答に応じて適当なあいさつを日本語でします",
})

export const weatherAgent = new Agent({
  name: "Weather Agent",
  tools: { weatherTool },
  model: anthropic("claude-haiku-4-5"),
  instructions: "You are a weather agent that helps users with weather information.",
  agents: {
    subAgent,
  },
  memory: new Memory({
    storage: new LibSQLStore({ url: "file::memory:" }),
    options: {
      workingMemory: {
        enabled: true,
        schema: AgentState,
      },
    },
  }),
});

