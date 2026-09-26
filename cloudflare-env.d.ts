declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    GOOGLE_CLIENT_ID?: string;
    ADMIN_EMAIL?: string;
    SHEET_SYNC_URL?: string;
    SHEET_SYNC_SECRET?: string;
    PDF_MAX_BYTES?: string;
    PDF_TOTAL_STORAGE_LIMIT_BYTES?: string;
  }
}
