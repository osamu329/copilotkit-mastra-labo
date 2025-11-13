import { mastra } from "@/mastra";
import { NextRequest } from "next/server";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;

  console.log('📍 POST /api/mastra/workflows - path:', path);

  // MastraClient adds /api/ prefix, so path[0] might be 'api'
  const adjustedPath = path[0] === 'api' ? path.slice(1) : path;

  // Handle workflow streaming: /api/mastra/workflows/{workflowName}/stream
  if (adjustedPath.length === 2 && adjustedPath[1] === "stream") {
    const workflowName = adjustedPath[0];
    const body = await req.json();

    try {
      const workflow = mastra.getWorkflow(workflowName);
      console.log('🔵 Creating workflow run...');
      const run = await workflow.createRunAsync();

      console.log('🔵 Starting streamVNext...');
      const stream = run.streamVNext({
        inputData: body.inputData,
      });

      // Convert workflow stream to SSE format
      const encoder = new TextEncoder();
      const sseStream = new ReadableStream({
        async start(controller) {
          try {
            for await (const chunk of stream) {
              console.log('🔵 Workflow chunk:', chunk);

              // Format as SSE: data: {json}\n\n
              const sseChunk = `data: ${JSON.stringify(chunk)}\n\n`;
              controller.enqueue(encoder.encode(sseChunk));
            }

            // Send stream completion marker
            controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
          } catch (error) {
            console.error('🔵 Workflow stream error:', error);
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
      console.error(`Error streaming workflow ${workflowName}:`, error);
      return Response.json(
        { error: "Workflow not found or error occurred" },
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

  // Handle workflow list: /api/mastra/workflows
  if (adjustedPath.length === 0) {
    const workflows = Object.keys(mastra._workflows || {});
    return Response.json({ workflows });
  }

  // Handle workflow details: /api/mastra/workflows/{workflowName}
  if (adjustedPath.length === 1) {
    const workflowName = adjustedPath[0];

    try {
      const workflow = mastra.getWorkflow(workflowName);
      return Response.json({
        name: workflow.name,
      });
    } catch (error) {
      return Response.json(
        { error: "Workflow not found" },
        { status: 404 }
      );
    }
  }

  return Response.json({ error: "Invalid path" }, { status: 404 });
}
