// EPIC-002: Authentication & User Management
// STORY-013: Sign-Out API and Expired Session Cleanup
// TASK-013-002: POST /api/auth/signout — delete session, clear cookie, return 200
// ADR-011: always 200 (idempotent); cookie cleared regardless of whether session existed
// PRD §9A: client redirects to /signin after receiving 200

import { NextRequest, NextResponse } from 'next/server';
import { signOut } from '@/modules/auth/auth.service';

export async function POST(req: NextRequest) {
  const sessionId = req.cookies.get('sessionId')?.value;

  if (sessionId) {
    await signOut(sessionId);
    console.log(`[STORY-013] sign-out: session deleted`);
  }

  const response = NextResponse.json({ success: true }, { status: 200 });
  // Clear cookie regardless of whether a session existed (idempotent sign-out)
  response.cookies.delete('sessionId');
  return response;
}
