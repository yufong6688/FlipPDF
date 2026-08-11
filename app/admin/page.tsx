import type { Metadata } from "next";
import { AdminLibrary } from "./AdminLibrary";

export const dynamic = "force-static";
export const metadata: Metadata = { title: "私密 PDF 書庫 - FLIP PDF" };

export default function AdminPage() {
  return <AdminLibrary />;
}
