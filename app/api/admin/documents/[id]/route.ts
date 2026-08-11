import { privateEnv, requireAdminRequest, type PdfDocumentRow } from "../../../../private-library";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const unauthorized = requireAdminRequest(request);
  if (unauthorized) return unauthorized;
  const { id } = await context.params;
  const document = await privateEnv.DB.prepare(
    "SELECT id, name, object_key, size, created_at FROM pdf_documents WHERE id = ?"
  ).bind(id).first<PdfDocumentRow>();
  if (!document) return Response.json({ error: "找不到 PDF。" }, { status: 404 });

  const object = await privateEnv.PDF_BUCKET.get(document.object_key);
  if (!object?.body) return Response.json({ error: "找不到 PDF 檔案。" }, { status: 404 });
  return new Response(object.body, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(document.name)}.pdf`,
      "Cache-Control": "private, no-store",
      "X-PDF-Name": encodeURIComponent(document.name),
    },
  });
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const unauthorized = requireAdminRequest(request);
  if (unauthorized) return unauthorized;
  const { id } = await context.params;
  const document = await privateEnv.DB.prepare(
    "SELECT id, name, object_key, size, created_at FROM pdf_documents WHERE id = ?"
  ).bind(id).first<PdfDocumentRow>();
  if (!document) return Response.json({ error: "找不到 PDF。" }, { status: 404 });

  await privateEnv.PDF_BUCKET.delete(document.object_key);
  await privateEnv.DB.prepare("DELETE FROM pdf_documents WHERE id = ?").bind(id).run();
  return Response.json({ deleted: true });
}
