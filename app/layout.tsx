import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "实验室样本管理系统",
  description: "本机运行的实验室样本入库、取样登记和实验结果管理系统"
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
