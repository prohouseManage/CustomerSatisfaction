import { NextRequest, NextResponse } from 'next/server';
export function proxy(request: NextRequest) {
  if (
    process.env.NODE_ENV === 'production' &&
    request.headers.get('x-forwarded-proto') === 'http'
  ) {
    const target = request.nextUrl.clone();
    target.protocol = 'https:';
    return NextResponse.redirect(target, 308);
  }
  return NextResponse.next();
}
export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
