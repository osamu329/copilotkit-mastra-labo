import { mastra } from "@/mastra";
import { NextRequest } from "next/server";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ agentName: string }> }
) {
  const { agentName } = await params;
  const body = await req.json();

  console.log('📍 POST /api/agents/{agentName}/stream - agentName:', agentName);

  try {
    // 動的ルートパラメータを型安全に扱うため、型アサーションを使用
    type MastraAgentName = Parameters<typeof mastra.getAgent>[0];
    const agent = mastra.getAgent(agentName as MastraAgentName);
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
