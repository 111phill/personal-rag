import type { Metadata } from 'next';
import { Noto_Sans_SC, Noto_Serif_SC } from 'next/font/google';
import './globals.css';

const sans = Noto_Sans_SC({ variable: '--font-sans-cn', subsets: ['latin'] });
const serif = Noto_Serif_SC({ variable: '--font-serif-cn', subsets: ['latin'] });

export const metadata: Metadata = {
  title: '我的知识库',
  description: '记录工作、学习与持续生长的个人知识空间。',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body className={`${sans.variable} ${serif.variable} antialiased`}>{children}</body>
    </html>
  );
}
