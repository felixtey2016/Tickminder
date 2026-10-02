import { NextResponse, type NextRequest } from "next/server";
import { legacyRedirectTarget } from "./lib/legacy-domain";

export function middleware(request: NextRequest) {
  const target = legacyRedirectTarget(request.url, request.method);
  if (!target) return NextResponse.next();
  const response = NextResponse.redirect(target, 308);
  response.headers.set("Cache-Control", "public, max-age=300");
  return response;
}