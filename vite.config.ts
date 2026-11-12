import { defineConfig } from 'vite';

// Vite 的 base 选项决定构建产物里资源引用是绝对 /xxx 还是带前缀 /repo/xxx。
// GitHub Pages 部署到普通仓库时 URL 是 https://<user>.github.io/<repo>/，
// 所以必须让 base 等于 "/<repo>/"。部署到用户组织页（<user>.github.io）
// 或自定义域时 base 保持 "/" 即可。
//
// 通过环境变量注入，本地开发默认 "/"，CI workflow 里再设置 VITE_BASE。
export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
  build: {
    // SPA：找不到的静态资源（比如直接刷新子路由）都回退到 index.html。
    // GitHub Pages 原生不支持 rewrite，见 deploy.yml 末尾的 404 兼容方案。
    emptyOutDir: true,
    target: 'ES2022',
  },
});
