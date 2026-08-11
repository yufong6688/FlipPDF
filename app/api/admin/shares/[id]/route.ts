import { privateEnv, requireAdminRequest } from "../../../../private-library";

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const unauthorized = requireAdminRequest(request);
  if (unauthorized) return unauthorized;
  const { id } = await context.params;
  await privateEnv.DB.prepare("UPDATE pdf_shares SET revoked_at = ? WHERE id = ?").bind(Date.now(), id).run();
  return Response.json({ revoked: true });
}
