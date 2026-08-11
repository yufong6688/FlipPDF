import type { Metadata } from "next";
import { PdfFlipbook } from "./PdfFlipbook";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Flip PDF - 翻頁閱讀器",
  description: "在瀏覽器中將 PDF 變成可翻頁的數位書。",
};

export default function Home() {
  return <PdfFlipbook />;
}
