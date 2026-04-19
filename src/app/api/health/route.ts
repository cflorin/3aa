// EPIC-001/STORY-003/TASK-003-006
// Health check endpoint for Cloud Run deployment verification

import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: '3aa-web',
  }, { status: 200 });
}
