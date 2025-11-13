import { mastra } from "@/mastra";
import { NextRequest } from "next/server";

/**
 * Workflow Streaming API - VNext streamVNext() implementation
 *
 * Uses: run.streamVNext()
 * Returns: MastraWorkflowStream (directly iterable)
 *
 * Characteristics:
 * - Returns a custom stream object that is directly iterable
 * - Stream extends ReadableStream with additional properties:
 *   - stream.result: Promise<WorkflowResult>
 *   - stream.status: Promise<RunStatus>
 *   - stream.usage: Promise<UsageInfo>
 *   - stream.traceId?: string
 * - More ergonomic API - no need to access .stream property
 * - Enhanced capabilities - will eventually replace stream()
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ workflowName: string }> }
) {
  const { workflowName } = await params;
  const body = await req.json();

  console.log('📍 [VNEXT] POST /api/workflows/{workflowName}/stream - workflowName:', workflowName);

  try {
    const workflow = mastra.getWorkflow(workflowName);
    console.log('🔵 [VNEXT] Creating workflow run...');
    const run = await workflow.createRunAsync();

    console.log('🔵 [VNEXT] Starting streamVNext()...');
    const stream = run.streamVNext({
      inputData: body.inputData,
    });

    // Convert workflow stream to SSE format
    const encoder = new TextEncoder();
    const sseStream = new ReadableStream({
      async start(controller) {
        try {
          // Direct iteration - stream is itself iterable
          for await (const chunk of stream) {
            console.log('🔵 [VNEXT] Workflow chunk:', chunk);

            // Format as SSE: data: {json}\n\n
            const sseChunk = `data: ${JSON.stringify(chunk)}\n\n`;
            controller.enqueue(encoder.encode(sseChunk));
          }

          // Access additional promises (optional)
          const [result, status, usage] = await Promise.all([
            stream.result,
            stream.status,
            stream.usage
          ]);

          console.log('🔵 [VNEXT] Final result:', result);
          console.log('🔵 [VNEXT] Final status:', status);
          console.log('🔵 [VNEXT] Usage:', usage);
          if (stream.traceId) {
            console.log('🔵 [VNEXT] Trace ID:', stream.traceId);
          }

          // Send additional metadata
          controller.enqueue(encoder.encode(
            `data: ${JSON.stringify({
              type: 'workflow-complete',
              result,
              status,
              usage,
              traceId: stream.traceId
            })}\n\n`
          ));

          // Send stream completion marker
          controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
        } catch (error) {
          console.error('🔵 [VNEXT] Workflow stream error:', error);
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
    console.error(`[VNEXT] Error streaming workflow ${workflowName}:`, error);
    return Response.json(
      { error: "Workflow not found or error occurred" },
      { status: 404 }
    );
  }
}
