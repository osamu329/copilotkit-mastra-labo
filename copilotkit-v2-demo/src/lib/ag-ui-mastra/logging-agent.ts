import { MastraAgent, type MastraAgentConfig } from "@ag-ui/mastra";
import { EventType, type RunAgentInput, type BaseEvent } from "@ag-ui/client";
import type { RunAgentParameters } from "@ag-ui/client/dist/agent/types";
import type { AgentSubscriber } from "@ag-ui/client/dist/agent/subscriber";
import { Observable } from "rxjs";
import { tap } from "rxjs/operators";

export class LoggingMastraAgent extends MastraAgent {
  constructor(config: MastraAgentConfig) {
    super(config);
    console.log("🚀 LoggingMastraAgent constructed");
  }

  run(input: RunAgentInput): Observable<BaseEvent> {
    console.log("🚀 LoggingMastraAgent.run() called");
    return super.run(input).pipe(
      tap((event) => {
        switch (event.type) {
          case EventType.TOOL_CALL_START:
            console.log("🔧 TOOL_CALL_START", JSON.stringify(event));
            break;
          case EventType.TOOL_CALL_ARGS:
            console.log("🔧 TOOL_CALL_ARGS", JSON.stringify(event));
            break;
          case EventType.TOOL_CALL_END:
            console.log("🔧 TOOL_CALL_END", JSON.stringify(event));
            break;
          case EventType.TOOL_CALL_RESULT:
            console.log("🔧 TOOL_CALL_RESULT", JSON.stringify(event));
            break;
        }
      }),
    );
  }

  async runAgent(parameters?: RunAgentParameters, subscriber?: AgentSubscriber) {
    console.log("🚀 LoggingMastraAgent.runAgent() called");
    return super.runAgent(parameters, subscriber);
  }
}
