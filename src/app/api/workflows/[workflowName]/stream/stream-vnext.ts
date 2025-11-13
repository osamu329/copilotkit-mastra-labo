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
 *
 * Test Results (2025-11-14):
 * ✅ Successfully streams workflow events
 * ✅ Events received (8 chunks):
 *    - workflow-start: { type, runId, from: 'WORKFLOW', payload: { workflowId } }
 *    - workflow-step-start: { type, runId, from: 'WORKFLOW', payload: { stepName, id, stepCallId, payload, startedAt, status } }
 *    - workflow-step-output: { type, runId, from: 'USER', payload: { output, stepName } } ← Custom writer.write() events!
 *    - workflow-step-result: { type, runId, from: 'WORKFLOW', payload: { stepName, id, stepCallId, status, output, endedAt } }
 *    - workflow-finish: { type, runId, from: 'WORKFLOW', payload: { workflowStatus, output: { usage }, metadata } }
 * ✅ stream.result returns: { status, steps, input, result, traceId: undefined }
 * ✅ stream.status returns: 'success'
 * ✅ stream.usage returns: { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
 * ✅ writer.write() custom events ARE received via workflow-step-output!
 *    - Custom events nested in: chunk.payload.output
 *    - from: 'USER' indicates custom event
 * ⚠️  traceId is still undefined (may require additional configuration)
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ workflowName: string }> }
) {
  const { workflowName } = await params;
  const body = await req.json();

  console.log('📍 [VNEXT] POST /api/workflows/{workflowName}/stream - workflowName:', workflowName);

  try {
    // 動的ルートパラメータを型安全に扱うため、型アサーションを使用
    type MastraWorkflowName = Parameters<typeof mastra.getWorkflow>[0];
    const workflow = mastra.getWorkflow(workflowName as MastraWorkflowName);
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
            // console.log('🔵 [VNEXT] Workflow chunk:', chunk);
            //
            // ========== 実際の出力（テスト日: 2025-11-14）==========
            // ✅ 合計8チャンク受信:
            //
            // チャンク1: { type: 'workflow-start', runId: 'eeec96d9-...', from: 'WORKFLOW', payload: { workflowId: 'testWorkflow' } }
            //
            // チャンク2: { type: 'workflow-step-start', runId: 'eeec96d9-...', from: 'WORKFLOW',
            //   payload: { stepName: 'step1', id: 'step1', stepCallId: '0059d8a0-...', payload: { value: 'こんにちは' }, startedAt: 1763064408999, status: 'running' } }
            //
            // チャンク3: { type: 'workflow-step-output', runId: 'eeec96d9-...', from: 'USER',
            //   payload: { output: { type: 'step-progress', message: 'step1を開始しました' }, runId: 'eeec96d9-...', stepName: 'step1' } }
            //   ✅ writer.write() のカスタムイベント！
            //
            // チャンク4: { type: 'workflow-step-result', runId: 'eeec96d9-...', from: 'WORKFLOW',
            //   payload: { stepName: 'step1', id: 'step1', stepCallId: '0059d8a0-...', status: 'success', output: { result: 'Step1: こんにちは' }, endedAt: 1763064409003 } }
            //
            // チャンク5: { type: 'workflow-step-start', runId: 'eeec96d9-...', from: 'WORKFLOW',
            //   payload: { stepName: 'step2', id: 'step2', stepCallId: '214bb639-...', payload: { result: 'Step1: こんにちは' }, startedAt: 1763064409003, status: 'running' } }
            //
            // チャンク6: { type: 'workflow-step-output', runId: 'eeec96d9-...', from: 'USER',
            //   payload: { output: { type: 'step-progress', message: 'step2を終了しました' }, runId: 'eeec96d9-...', stepName: 'step2' } }
            //   ✅ writer.write() のカスタムイベント！
            //
            // チャンク7: { type: 'workflow-step-result', runId: 'eeec96d9-...', from: 'WORKFLOW',
            //   payload: { stepName: 'step2', id: 'step2', stepCallId: '214bb639-...', status: 'success', output: { finalResult: 'Step1: こんにちは -> Step2完了' }, endedAt: 1763064409004 } }
            //
            // チャンク8: { type: 'workflow-finish', runId: 'eeec96d9-...', from: 'WORKFLOW',
            //   payload: { workflowStatus: 'success', output: { usage: {...} }, metadata: {} } }
            //
            // 重要な発見:
            // ✅ writer.write() イベントは 'workflow-step-output' タイプで受信
            // ✅ カスタムイベントは chunk.payload.output からアクセス可能
            // ✅ 'from' フィールド = 'USER' でカスタムイベント、'WORKFLOW' でシステムイベント
            // ✅ 全チャンクに runId が含まれており、相関が可能
            // ======================================================

            // Format as SSE: data: {json}\n\n
            const sseChunk = `data: ${JSON.stringify(chunk)}\n\n`;
            controller.enqueue(encoder.encode(sseChunk));
          }

          // 追加のプロミスにアクセス（オプション）
          const [result, status, usage] = await Promise.all([
            stream.result,
            stream.status,
            stream.usage
          ]);

          // console.log('🔵 [VNEXT] Final result:', result);
          // ========== 実際の出力（stream.result）==========
          // {
          //   status: 'success',
          //   steps: {
          //     input: { value: 'こんにちは' },
          //     step1: {
          //       payload: { value: 'こんにちは' },
          //       startedAt: 1763064408999,
          //       status: 'success',
          //       output: { result: 'Step1: こんにちは' },
          //       endedAt: 1763064409003
          //     },
          //     step2: {
          //       payload: { result: 'Step1: こんにちは' },
          //       startedAt: 1763064409003,
          //       status: 'success',
          //       output: { finalResult: 'Step1: こんにちは -> Step2完了' },
          //       endedAt: 1763064409004
          //     }
          //   },
          //   input: { value: 'こんにちは' },
          //   result: { finalResult: 'Step1: こんにちは -> Step2完了' },
          //   traceId: undefined  // ⚠️ 未設定（環境設定が必要？）
          // }
          // ======================================================

          // console.log('🔵 [VNEXT] Final status:', status);
          // 出力: 'success'

          // console.log('🔵 [VNEXT] Usage:', usage);
          // 出力: { inputTokens: 0, outputTokens: 0, totalTokens: 0 }

          // if (stream.traceId) {
          //   console.log('🔵 [VNEXT] Trace ID:', stream.traceId);
          // }
          // traceId は undefined のため実行されず

          // Send additional metadata
          controller.enqueue(encoder.encode(
            `data: ${JSON.stringify({
              type: 'workflow-complete',
              result,
              status,
              usage,
              traceId: (stream as any).traceId // traceId は型定義に含まれていないが、実行時に存在する可能性がある
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
