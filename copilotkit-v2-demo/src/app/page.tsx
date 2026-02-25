"use client";

import {
  CopilotChat,
  CopilotKitProvider,
} from "@copilotkitnext/react";
import type { ReactActivityMessageRenderer } from "@copilotkitnext/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { DemoAgent } from "./demo-agent";

export const dynamic = "force-dynamic";

// --- Mastra Workflow Step Renderer ---

const ROW_HEIGHT = 36;

/** 1行分のステップ表示 */
function StepRow({ name, index, total }: { name: string; index: number; total: number }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "0 12px",
        height: ROW_HEIGHT,
        fontSize: "13px",
        fontFamily: "monospace",
        whiteSpace: "nowrap",
      }}
    >
      <span style={{ color: "#3b82f6", animation: "wf-spin 1.2s linear infinite", display: "inline-block" }}>
        {"\u25D4"}
      </span>
      <span style={{ fontWeight: 600, color: "#111827" }}>{name}</span>
      <span style={{ fontSize: 11, color: "#9ca3af" }}>{index + 1}/{total}</span>
      <span style={{ marginLeft: "auto", fontSize: 11, color: "#3b82f6" }}>running...</span>
    </div>
  );
}

/**
 * 1行固定のティッカー表示。
 * ステップが切り替わると、前のステップが上にスクロールアウトし、
 * 新しいステップが下からスライドインする。
 */
function WorkflowStepCard({
  content,
}: {
  activityType: string;
  content: {
    workflowName: string;
    stepName: string;
    stepIndex: number;
    totalSteps: number;
    status: string;
    output?: string;
  };
  message: unknown;
  agent: unknown;
}) {
  const prevRef = useRef<{ stepName: string; stepIndex: number } | null>(null);
  const [prev, setPrev] = useState<{ stepName: string; stepIndex: number } | null>(null);
  // phase: "idle" → "ready" (2行描画、translateY(0)) → "slide" (translateY(-36px)) → "idle"
  const [phase, setPhase] = useState<"idle" | "ready" | "slide">("idle");

  useEffect(() => {
    const cur = prevRef.current;
    if (cur && cur.stepIndex !== content.stepIndex) {
      setPrev({ ...cur });
      setPhase("ready"); // まず2行をtranslateY(0)で描画
    }
    prevRef.current = { stepName: content.stepName, stepIndex: content.stepIndex };
  }, [content.stepIndex, content.stepName]);

  // "ready"の次フレームで"slide"にしてtransitionを発火
  useEffect(() => {
    if (phase === "ready") {
      const raf = requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setPhase("slide");
        });
      });
      return () => cancelAnimationFrame(raf);
    }
  }, [phase]);

  if (content.status === "completed") return null;

  const isAnimating = phase === "ready" || phase === "slide";

  return (
    <div
      style={{
        height: ROW_HEIGHT,
        overflow: "hidden",
        margin: "2px 0",
        borderRadius: "10px",
        border: "1px solid #93c5fd",
        background: "#eff6ff",
      }}
    >
      <div
        style={{
          transform: phase === "slide" ? `translateY(-${ROW_HEIGHT}px)` : "translateY(0)",
          transition: phase === "slide" ? "transform 0.35s ease-in-out" : undefined,
        }}
        onTransitionEnd={() => {
          setPhase("idle");
          setPrev(null);
        }}
      >
        {isAnimating && prev && (
          <StepRow name={prev.stepName} index={prev.stepIndex} total={content.totalSteps} />
        )}
        <StepRow name={content.stepName} index={content.stepIndex} total={content.totalSteps} />
      </div>
      <style>{`
        @keyframes wf-spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

/** Prefills the CopilotChat textarea with "test" on mount */
function ChatWithPrefill() {
  useEffect(() => {
    const timer = setTimeout(() => {
      const textarea = document.querySelector<HTMLTextAreaElement>("textarea");
      if (!textarea) return;
      const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        "value",
      )?.set;
      nativeSetter?.call(textarea, "test");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    }, 300);
    return () => clearTimeout(timer);
  }, []);

  return <CopilotChat />;
}

export default function Home() {
  const demoAgent = useMemo(() => new DemoAgent(), []);

  const activityRenderers = useMemo<ReactActivityMessageRenderer<any>[]>(
    () => [
      {
        activityType: "workflow-step",
        content: z.object({
          workflowName: z.string(),
          stepName: z.string(),
          stepIndex: z.number(),
          totalSteps: z.number(),
          status: z.string(),
          output: z.string().optional(),
        }),
        render: WorkflowStepCard,
      },
    ],
    [],
  );

  return (
    <CopilotKitProvider
      agents__unsafe_dev_only={{ default: demoAgent }}
      renderActivityMessages={activityRenderers}
      showDevConsole={true}
    >
      <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
        <header
          style={{
            padding: "16px 24px",
            borderBottom: "1px solid #e5e7eb",
            background: "#fff",
          }}
        >
          <h1 style={{ margin: 0, fontSize: "18px", fontWeight: 700 }}>
            CopilotKit v2 - Mastra Workflow Progress Demo
          </h1>
          <p style={{ margin: "4px 0 0", fontSize: "13px", color: "#6b7280" }}>
            Send a message to trigger a simulated Mastra workflow with step-by-step progress
          </p>
        </header>
        <div style={{ flex: 1, minHeight: 0 }}>
          <ChatWithPrefill />
        </div>
      </div>
    </CopilotKitProvider>
  );
}
