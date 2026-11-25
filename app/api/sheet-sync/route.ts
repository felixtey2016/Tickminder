/** Retired endpoint: old clients must not write to any spreadsheet. */
const gone=()=>Response.json({error:"This integration has been removed. Use CSV export.",code:"integration_retired"},{status:410,headers:{"Cache-Control":"no-store"}});
export const GET=gone;
export const POST=gone;
