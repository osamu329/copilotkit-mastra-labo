import { mastra } from "@/mastra";
import { NextRequest } from "next/server";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ agentName: string }> }
) {
  const { agentName } = await params;
  const body = await req.json();

  console.log('📍 POST /api/agents/{agentName}/generate - agentName:', agentName);

  try {
    // 動的ルートパラメータを型安全に扱うため、型アサーションを使用
    type MastraAgentName = Parameters<typeof mastra.getAgent>[0];
    const agent = mastra.getAgent(agentName as MastraAgentName);
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
