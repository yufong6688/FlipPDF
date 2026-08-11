import { createId, privateEnv, requireAdminRequest } from "../../../private-library";

export async function GET(request: Request) {
  const unauthorized = requireAdminRequest(request);
  if (unauthorized) return unauthorized;

  const result = await privateEnv.DB.prepare(
    "SELECT id, name, size, created_at FROM pdf_documents ORDER BY created_at DESC"
  ).all();
  return Response.json({ documents: result.results });
}

export async function POST(request: Request) {
  const unauthorized = requireAdminRequest(request);
  if (unauthorized) return unauthorized;

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File) || (!file.name.toLowerCase().endsWith(".pdf") && file.type !== "application/pdf")) {
    return Response.json({ error: "請選擇 PDF 檔案。" }, { status: 400 });
  }
  if (file.size > 100 * 1024 * 1024) {
    return Response.json({ error: "PDF 不可超過 100 MB。" }, { status: 413 });
  }

  const id = createId();
  const objectKey = `pdf/${id}.pdf`;
  const ownerId = request.headers.get("oai-authenticated-user-id") ?? "admin";
  const createdAt = Date.now();

  await privateEnv.PDF_BUCKET.put(objectKey, file.stream(), {
    httpMetadata: { contentType: "application/pdf" },
    customMetadata: { originalName: encodeURIComponent(file.name) },
  });
  try {
    await privateEnv.DB.prepare(
      "INSERT INTO pdf_documents (id, name, object_key, size, owner_id, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).bind(id, file.name.replace(/\.pdf$/i, ""), objectKey, file.size, ownerId, createdAt).run();
  } catch (error) {
    await privateEnv.PDF_BUCKET.delete(objectKey);
    throw error;
  }

  return Response.json({ document: { id, name: file.name.replace(/\.pdf$/i, ""), size: file.size, created_at: createdAt } }, { status: 201 });
}
