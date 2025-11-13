import { mastra } from "@/mastra";
import { NextRequest } from "next/server";

/**
 * Workflow Streaming API - Legacy stream() implementation
 *
 * Uses: run.stream()
 * Returns: { stream, getWorkflowState }
 *
 * Characteristics:
 * - Returns an object with stream and getWorkflowState properties
 * - Need to iterate over the stream property
 * - Use getWorkflowState() function to get final result
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ workflowName: string }> }
) {
  const { workflowName } = await params;
  const body = await req.json();

  console.log('📍 [LEGACY] POST /api/workflows/{workflowName}/stream - workflowName:', workflowName);

  try {
    const workflow = mastra.getWorkflow(workflowName);
    console.log('🔵 [LEGACY] Creating workflow run...');
    const run = await workflow.createRunAsync();

    console.log('🔵 [LEGACY] Starting stream()...');
    const { stream, getWorkflowState } = await run.stream({
      inputData: body.inputData,
    });

    // Convert workflow stream to SSE format
    const encoder = new TextEncoder();
    const sseStream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            console.log('🔵 [LEGACY] Workflow chunk:', chunk);

            // Format as SSE: data: {json}\n\n
            const sseChunk = `data: ${JSON.stringify(chunk)}\n\n`;
            controller.enqueue(encoder.encode(sseChunk));
          }

          // Get final workflow state
          const finalState = await getWorkflowState();
          console.log('🔵 [LEGACY] Final workflow state:', finalState);

          // Send stream completion marker
          controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
        } catch (error) {
          console.error('🔵 [LEGACY] Workflow stream error:', error);
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
    console.error(`[LEGACY] Error streaming workflow ${workflowName}:`, error);
    return Response.json(
      { error: "Workflow not found or error occurred" },
      { status: 404 }
    );
  }
}
