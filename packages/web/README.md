# `@memora/web`

Memora 的主前端应用，基于 React 19、Vite、React Router 和 Tailwind CSS 4。

## Development

- 启动开发服务器：`pnpm --filter @memora/web dev`
- 默认端口：`9001`
- 预览生产构建：`pnpm --filter @memora/web preview`

也可以从 workspace 根目录使用：

- `pnpm dev:web`
- `pnpm build:web`
- `pnpm lint:web`

## Build

- 生产构建：`pnpm --filter @memora/web build`
- 构建流程：`tsc -b && vite build`

## Lint

- 运行 lint：`pnpm --filter @memora/web lint`

## Routing

- 路由入口只放在 `src/pages`
- 页面内部组件不要放在 `src/pages`，否则会被 `vite-plugin-route-builder` 识别成真实路由
- 当前真实路由：
  - `/`
  - `/chat`
  - `/files`
  - `/transcript`
  - `/transcript/live`
  - `/transcript/file/:id`

## Structure

- `src/app`：应用壳、路由、布局、全局导航
- `src/components/chat`：聊天页面与聊天 UI 组件
- `src/components/desktop`：桌面工作区、拖拽、窗口、上传 UI
- `src/components/library`：文件卡片、文件网格、播放器等文件 UI
- `src/components/settings`：设置相关 UI
- `src/components/transcript`：转写页面与转写展示 UI
- `src/components/assistant`：助手形象等共享角色 UI
- `src/hooks/chat|desktop|library|settings|transcript`：按领域拆分的交互逻辑
- `src/lib/chat|desktop|library|settings|transcript`：按领域拆分的服务、查询和工具逻辑
- `src/types`：类型定义
- `src/lib`：工具函数
- `src/livestore`：schema、table、event 定义

## Notes

- `src/generated-routes.ts` 为生成文件，不要手改
- `react-scan` 仅在开发环境启用
- 大型静态资源（VAD worklet、ONNX、WASM）由 Vite 在构建时复制

## PWA

- 已通过 `vite-plugin-pwa` 接入 Web App Manifest 和 Service Worker
- 生产构建会生成可安装的 PWA 资源与离线缓存策略
- 入口会在生产环境自动注册 Service Worker
- 大体积 AI 资源（`.mjs`、`.wasm`、`.onnx`）使用运行时缓存，避免进入预缓存列表
