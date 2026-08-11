import { createId, createShareToken, hashShareToken, privateEnv, requireAdminRequest } from "../../../private-library";

export async function GET(request: Request) {
  const unauthorized = requireAdminRequest(request);
  if (unauthorized) return unauthorized;
  const result = await privateEnv.DB.prepare(
    `SELECT s.id, s.document_id, s.created_at, s.expires_at, s.revoked_at, d.name
     FROM pdf_shares s JOIN pdf_documents d ON d.id = s.document_id
     ORDER BY s.created_at DESC`
  ).all();
  return Response.json({ shares: result.results });
}

export async function POST(request: Request) {
  const unauthorized = requireAdminRequest(request);
  if (unauthorized) return unauthorized;
  const payload = await request.json() as { documentId?: string; expiresDays?: number | null };
  if (!payload.documentId) return Response.json({ error: "缺少 PDF。" }, { status: 400 });
  const document = await privateEnv.DB.prepare("SELECT id FROM pdf_documents WHERE id = ?").bind(payload.documentId).first();
  if (!document) return Response.json({ error: "找不到 PDF。" }, { status: 404 });

  const token = createShareToken();
  const id = createId();
  const createdAt = Date.now();
  const expiresAt = payload.expiresDays ? createdAt + payload.expiresDays * 86400000 : null;
  await privateEnv.DB.prepare(
    "INSERT INTO pdf_shares (id, token_hash, document_id, created_at, expires_at, revoked_at) VALUES (?, ?, ?, ?, ?, NULL)"
  ).bind(id, await hashShareToken(token), payload.documentId, createdAt, expiresAt).run();

  const origin = new URL(request.url).origin;
  return Response.json({ share: { id, url: `${origin}/?share=${encodeURIComponent(token)}`, createdAt, expiresAt } }, { status: 201 });
}
