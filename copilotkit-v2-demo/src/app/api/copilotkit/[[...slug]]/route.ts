import {
  CopilotRuntime,
  createCopilotEndpoint,
  InMemoryAgentRunner,
} from "@copilotkitnext/runtime";
import { handle } from "hono/vercel";
import { MastraAgent } from "@/lib/ag-ui-mastra";
import { mastra } from "@/lib/mastra";

const aguiAgent = new MastraAgent({
  agentId: "data-agent",
  agent: mastra.getAgent("data-agent"),
  resourceId: "default",
});

const honoRuntime = new CopilotRuntime({
  agents: {
    default: aguiAgent,
  },
  runner: new InMemoryAgentRunner(),
});

const app = createCopilotEndpoint({
  runtime: honoRuntime,
  basePath: "/api/copilotkit",
});

export const GET = handle(app);
export const POST = handle(app);
