import {
  CopilotRuntime,
  createCopilotEndpoint,
  InMemoryAgentRunner,
} from "@copilotkitnext/runtime";
import { handle } from "hono/vercel";
import { BuiltInAgent } from "@copilotkitnext/agent";

const agent = new BuiltInAgent({
  model: "openai/gpt-4o-mini",
  prompt:
    "You are a helpful AI assistant. Answer user questions concisely.",
});

const honoRuntime = new CopilotRuntime({
  agents: {
    default: agent,
  },
  runner: new InMemoryAgentRunner(),
});

const app = createCopilotEndpoint({
  runtime: honoRuntime,
  basePath: "/api/copilotkit",
});

export const GET = handle(app);
export const POST = handle(app);
