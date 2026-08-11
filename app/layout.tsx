import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Flip PDF - 翻頁閱讀器",
  description: "在瀏覽器中將 PDF 變成可翻頁的數位書。",
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-Hant">
      <body>{children}</body>
    </html>
  );
}
