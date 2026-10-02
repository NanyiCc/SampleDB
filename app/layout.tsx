import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SampleDB · 智能样本库",
  description: "样本全景、实验追溯与联合对比工作区"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
