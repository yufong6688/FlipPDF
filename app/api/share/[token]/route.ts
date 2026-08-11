import { hashShareToken, privateEnv, type PdfDocumentRow } from "../../../private-library";

type SharedDocumentRow = PdfDocumentRow & { expires_at: number | null; revoked_at: number | null };

export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const tokenHash = await hashShareToken(token);
  const document = await privateEnv.DB.prepare(
    `SELECT d.id, d.name, d.object_key, d.size, d.created_at, s.expires_at, s.revoked_at
     FROM pdf_shares s JOIN pdf_documents d ON d.id = s.document_id
     WHERE s.token_hash = ?`
  ).bind(tokenHash).first<SharedDocumentRow>();
  if (!document || document.revoked_at || (document.expires_at && document.expires_at <= Date.now())) {
    return Response.json({ error: "分享連結無效或已過期。" }, { status: 404, headers: { "Cache-Control": "no-store" } });
  }

  const object = await privateEnv.PDF_BUCKET.get(document.object_key);
  if (!object?.body) return Response.json({ error: "找不到 PDF 檔案。" }, { status: 404 });
  return new Response(object.body, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(document.name)}.pdf`,
      "Cache-Control": "private, no-store",
      "X-PDF-Name": encodeURIComponent(document.name),
      "X-Content-Type-Options": "nosniff",
    },
  });
}
