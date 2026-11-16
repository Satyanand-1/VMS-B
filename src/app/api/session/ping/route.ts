import { NextResponse } from 'next/server';

// Keep-alive while the user is active in the browser (typing, clicking) without loading pages.
// The middleware does the work: it checks the 15-minute limit and refreshes the last-activity cookie.
export const dynamic = 'force-dynamic';
export function GET() {
  return new NextResponse(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
}
