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
 *
 * Test Results (2025-11-14):
 * ✅ Successfully streams workflow events
 * ✅ Events received:
 *    - start: { type: 'start', payload: { runId } }
 *    - step-start: { type: 'step-start', payload: { id, stepCallId, payload, startedAt, status } }
 *    - step-result: { type: 'step-result', payload: { id, stepCallId, status, output, endedAt } }
 *    - step-finish: { type: 'step-finish', payload: { id, stepCallId, metadata } }
 *    - finish: { type: 'finish', payload: { runId } }
 * ✅ getWorkflowState() returns:
 *    { status: 'success', steps: {...}, input: {...}, result: {...}, traceId: undefined }
 * ⚠️  writer.write() custom events NOT received
 *    - Defined: { type: "step-progress", message: "..." }
 *    - Not appearing in stream chunks
 * ⚠️  traceId is undefined (not available in legacy API)
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ workflowName: string }> }
) {
  const { workflowName } = await params;
  const body = await req.json();

  // console.log('📍 [LEGACY] POST /api/workflows/{workflowName}/stream - workflowName:', workflowName);

  try {
    const workflow = mastra.getWorkflow(workflowName);
    // console.log('🔵 [LEGACY] Creating workflow run...');
    const run = await workflow.createRunAsync();

    // console.log('🔵 [LEGACY] Starting stream()...');
    const { stream, getWorkflowState } = await run.stream({
      inputData: body.inputData,
    });

    // Convert workflow stream to SSE format
    const encoder = new TextEncoder();
    const sseStream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            // console.log('🔵 [LEGACY] Workflow chunk:', chunk);
            //
            // ========== ACTUAL OUTPUT (Test: 2025-11-14) ==========
            // ✅ Received 8 chunks total:
            //
            // Chunk 1: { type: 'start', payload: { runId: 'af340ced-db8a-4a9a-adef-2714fe832c8f' } }
            //
            // Chunk 2: { type: 'step-start', payload: { id: 'step1', stepCallId: '64221a85-23c4-46a2-81fd-7cc7affcd9e9', payload: { value: 'こんにちは' }, startedAt: 1763064212245, status: 'running' } }
            //
            // Chunk 3: { type: 'step-result', payload: { id: 'step1', stepCallId: '64221a85-23c4-46a2-81fd-7cc7affcd9e9', status: 'success', output: { result: 'Step1: こんにちは' }, endedAt: 1763064212247 } }
            //
            // Chunk 4: { type: 'step-finish', payload: { id: 'step1', stepCallId: '64221a85-23c4-46a2-81fd-7cc7affcd9e9', metadata: {} } }
            //
            // Chunk 5: { type: 'step-start', payload: { id: 'step2', stepCallId: 'fc0e15ba-36e3-400f-99b3-ec541c508210', payload: { result: 'Step1: こんにちは' }, startedAt: 1763064212247, status: 'running' } }
            //
            // Chunk 6: { type: 'step-result', payload: { id: 'step2', stepCallId: 'fc0e15ba-36e3-400f-99b3-ec541c508210', status: 'success', output: { finalResult: 'Step1: こんにちは -> Step2完了' }, endedAt: 1763064212248 } }
            //
            // Chunk 7: { type: 'step-finish', payload: { id: 'step2', stepCallId: 'fc0e15ba-36e3-400f-99b3-ec541c508210', metadata: {} } }
            //
            // Chunk 8: { type: 'finish', payload: { runId: 'af340ced-db8a-4a9a-adef-2714fe832c8f' } }
            //
            // ========== EXPECTED BUT NOT RECEIVED ==========
            // ❌ Custom writer.write() events from test-workflow.ts:
            //
            // Expected after step1 starts (line 15-18):
            //   { type: "step-progress", message: "step1を開始しました" }
            //
            // Expected before step2 ends (line 41-44):
            //   { type: "step-progress", message: "step2を終了しました" }
            //
            // CONCLUSION: stream() does NOT emit writer.write() custom events
            // ======================================================

            // Format as SSE: data: {json}\n\n
            const sseChunk = `data: ${JSON.stringify(chunk)}\n\n`;
            controller.enqueue(encoder.encode(sseChunk));
          }

          // Get final workflow state
          const finalState = await getWorkflowState();
          // console.log('🔵 [LEGACY] Final workflow state:', finalState);
          //
          // ========== ACTUAL OUTPUT (getWorkflowState) ==========
          // {
          //   status: 'success',
          //   steps: {
          //     input: { value: 'こんにちは' },
          //     step1: {
          //       payload: { value: 'こんにちは' },
          //       startedAt: 1763064212245,
          //       status: 'success',
          //       output: { result: 'Step1: こんにちは' },
          //       endedAt: 1763064212247
          //     },
          //     step2: {
          //       payload: { result: 'Step1: こんにちは' },
          //       startedAt: 1763064212247,
          //       status: 'success',
          //       output: { finalResult: 'Step1: こんにちは -> Step2完了' },
          //       endedAt: 1763064212248
          //     }
          //   },
          //   input: { value: 'こんにちは' },
          //   result: { finalResult: 'Step1: こんにちは -> Step2完了' },
          //   traceId: undefined  // ⚠️ Legacy API does not provide traceId
          // }
          // ======================================================

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
