import { getDb } from '@/db';
import { createConversation, listConversations } from '@/db/agent-store';

export async function GET() {
  return Response.json({ conversations: await listConversations(getDb()) }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST() {
  return Response.json({ conversation: await createConversation(getDb()) }, { status: 201 });
}
