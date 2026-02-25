import { Mastra } from "@mastra/core";
import { dataAgent } from "./agent";
import { dataProcessingWorkflow } from "./workflow";

export const mastra = new Mastra({
  agents: { "data-agent": dataAgent },
  workflows: { "data-processing": dataProcessingWorkflow },
});
