import { env } from "cloudflare:workers";

type PrivateLibraryEnv = {
  DB: D1Database;
  PDF_BUCKET: R2Bucket;
  ADMIN_EMAIL?: string;
};

export type PdfDocumentRow = {
  id: string;
  name: string;
  object_key: string;
  size: number;
  created_at: number;
};

export const privateEnv = env as unknown as PrivateLibraryEnv;

export function requireAdminRequest(request: Request): Response | null {
  const email = request.headers.get("oai-authenticated-user-email")?.toLowerCase();
  const adminEmail = privateEnv.ADMIN_EMAIL?.trim().toLowerCase();
  if (email && adminEmail && email === adminEmail) return null;
  return Response.json({ error: "請先以管理者帳號登入。" }, { status: 401 });
}

export function createId(): string {
  return crypto.randomUUID();
}

export function createShareToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export async function hashShareToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
