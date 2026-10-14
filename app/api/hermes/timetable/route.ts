import { handleTimetable, timetableAuthorized, TimetableError } from "@/lib/hermes-timetable";
const headers = { "Cache-Control":"no-store", "X-Content-Type-Options":"nosniff" };
export async function POST(request: Request) {
  if (!await timetableAuthorized(request)) return Response.json({error:"Unauthorized"},{status:401,headers});
  if (Number(request.headers.get("content-length") || 0)>100000) return Response.json({error:"Request too large"},{status:413,headers});
  try {
    const raw = await request.text();
    if (raw.length>100000) return Response.json({error:"Request too large"},{status:413,headers});
    const body = JSON.parse(raw);
    if (!body || Array.isArray(body) || typeof body!=="object") return Response.json({error:"Invalid request"},{status:400,headers});
    return Response.json(await handleTimetable(body),{headers});
  } catch(error) {
    if (error instanceof TimetableError) return Response.json({error:error.code},{status:error.status,headers});
    if (error instanceof SyntaxError) return Response.json({error:"Invalid JSON"},{status:400,headers});
    return Response.json({error:"Timetable service unavailable"},{status:503,headers});
  }
}
