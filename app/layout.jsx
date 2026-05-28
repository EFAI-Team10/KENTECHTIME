import './globals.css';

export const metadata = {
  title: 'KENTECHTIME',
  description: 'KENTECH 시간표 추천 서비스',
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
