export function generateStaticParams() {
  // Static export 模式下，動態路由不需要預渲染。
  // 這些頁面是全 client component，運行時由 useParams() 解析 ID。
  return [];
}