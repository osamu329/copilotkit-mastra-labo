import { mastra } from "@/mastra";
import { NextRequest } from "next/server";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;

  console.log('📍 POST /api/mastra/agents - path:', path);

  // MastraClient adds /api/ prefix, so path[0] might be 'api'
  const adjustedPath = path[0] === 'api' ? path.slice(1) : path;

  // Handle agent generate: /api/mastra/agents/{agentName}/generate
  if (adjustedPath.length === 2 && adjustedPath[1] === "generate") {
    const agentName = adjustedPath[0];
    const body = await req.json();

    try {
      const agent = mastra.getAgent(agentName);
      const response = await agent.generate(body.messages);

      return Response.json({ text: response.text });
    } catch (error) {
      console.error(`Error calling agent ${agentName}:`, error);
      return Response.json(
        { error: "Agent not found or error occurred" },
        { status: 404 }
      );
    }
  }

  // Handle agent streaming: /api/mastra/agents/{agentName}/stream
  if (adjustedPath.length === 2 && adjustedPath[1] === "stream") {
    const agentName = adjustedPath[0];
    const body = await req.json();

    try {
      const agent = mastra.getAgent(agentName);
      console.log('🟢 Calling agent.stream on server side...');
      const streamResult = await agent.stream(body.messages);

      console.log('🟢 Stream object on server:', {
        hasFullStream: !!streamResult.fullStream,
        hasTextStream: !!streamResult.textStream,
        streamKeys: Object.keys(streamResult)
      });

      // Convert fullStream to SSE format
      const encoder = new TextEncoder();
      const sseStream = new ReadableStream({
        async start(controller) {
          try {
            const reader = streamResult.fullStream.getReader();

            while (true) {
              const { done, value } = await reader.read();

              if (done) {
                // Send stream completion marker
                controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
                break;
              }

              // Format as SSE: data: {json}\n\n
              const sseChunk = `data: ${JSON.stringify(value)}\n\n`;
              controller.enqueue(encoder.encode(sseChunk));
              console.log('🟢 Sent chunk:', value);
            }
          } catch (error) {
            console.error('🟢 Stream error:', error);
            controller.error(error);
          } finally {
            controller.close();
          }
        }
      });

      return new Response(sseStream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      });
    } catch (error) {
      console.error(`Error streaming agent ${agentName}:`, error);
      return Response.json(
        { error: "Agent not found or error occurred" },
        { status: 404 }
      );
    }
  }

  return Response.json({ error: "Invalid path" }, { status: 404 });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;

  // MastraClient adds /api/ prefix, so path[0] might be 'api'
  const adjustedPath = path[0] === 'api' ? path.slice(1) : path;

  // Handle agent list: /api/mastra/agents
  if (adjustedPath.length === 0) {
    const agents = Object.keys(mastra._agents || {});
    return Response.json({ agents });
  }

  // Handle agent details: /api/mastra/agents/{agentName}
  if (adjustedPath.length === 1) {
    const agentName = adjustedPath[0];

    try {
      const agent = mastra.getAgent(agentName);
      return Response.json({
        name: agent.name,
        id: agent.id,
      });
    } catch (error) {
      return Response.json(
        { error: "Agent not found" },
        { status: 404 }
      );
    }
  }

  return Response.json({ error: "Invalid path" }, { status: 404 });
}
