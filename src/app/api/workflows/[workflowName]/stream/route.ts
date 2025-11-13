/**
 * Workflow Streaming API - Route Switcher
 *
 * This file serves as a switch point between two streaming implementations.
 * Comment/uncomment the appropriate line to switch between implementations.
 *
 * Available implementations:
 * 1. stream-legacy.ts - Uses run.stream() [Current/Stable API]
 * 2. stream-vnext.ts  - Uses run.streamVNext() [Experimental/Future API]
 *
 * To switch:
 * - Comment out the current export
 * - Uncomment the desired export
 * - Save and restart the server
 *
 * Comparison:
 * - Legacy: { stream, getWorkflowState } - requires accessing .stream property
 * - VNext: Direct iterable stream with additional promises (result, status, usage)
 */

// ============================================================================
// SWITCH HERE: Comment/Uncomment to choose implementation
// ============================================================================

// Option 1: Legacy stream() API
// export { POST } from './stream-legacy';
// ⚠️ stream() は writer.write() のカスタムイベントを送信しない

// Option 2: VNext streamVNext() API (推奨)
export { POST } from './stream-vnext';
// ✅ streamVNext() は writer.write() のカスタムイベントを workflow-step-output として送信

// ============================================================================
