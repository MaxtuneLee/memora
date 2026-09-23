# Memora 深色模式完整适配调研

日期：2026-09-22

## 结论

Memora 当前已经具备部分深色基础设施，但还没有形成一条完整的主题链路。`settings.theme` 已支持 `light`、`dark`、`system` 三态，通用 CSS token 也包含一套深色值；应用外壳仍固定应用 `lightTheme`，Memora 品牌 token 只有浅色值，大量 StyleX 样式直接使用浅色字面量，生成式 widget 的 iframe 也没有接收应用主题。

建议采用一个集中式主题管理器，由 `settings.theme` 解析出当前主题，并在 `document.documentElement` 上同步 StyleX theme class、`data-theme`、`color-scheme` 和 `theme-color`。颜色应统一为语义 token，组件只消费 token。iframe、canvas、代码编辑器和门户组件需要显式纳入主题边界。

StyleX 官方支持两条路径：用 `defineVars` 中的媒体查询值跟随系统，或用 `createTheme` 为 DOM 子树切换变量。官方也给出了 light、dark、system 三套主题的组合方式。[StyleX variables](https://github.com/facebook/stylex/blob/main/packages/docs/content/docs/learn/theming/using-variables.mdx) [StyleX themes](https://github.com/facebook/stylex/blob/main/packages/docs/content/docs/learn/theming/creating-themes.mdx) [StyleX light/dark recipe](https://github.com/facebook/stylex/blob/main/packages/docs/content/docs/learn/recipes/light-dark-themes.mdx)

## 当前状态

### 已有能力

- `packages/web/src/livestore/setting.ts` 已定义 `theme: "light" | "dark" | "system"`，默认值为 `system`。
- `packages/web/src/styles/tokens.css` 的通用背景、文字、边框和状态色已经在 `prefers-color-scheme: dark` 下提供深色值。
- `packages/web/src/styles/streamdown.css` 已为代码高亮读取 Shiki 的深色变量。
- `packages/web/src/styles/widgetBase.css` 已有 widget 级语义 token，说明生成内容可以沿用同一套颜色协议。
- StyleX 已静态提取并关闭 CSS layers，主题变量不会改变现有构建方式。

### 关键缺口

1. `packages/web/src/app/layouts/AppLayout.tsx` 在加载态和主外壳上始终应用 `lightTheme`，没有读取 `settings.theme`。
2. `packages/web/src/styles/stylex.stylex.ts` 只定义 `lightTheme`，token 数量不足以覆盖 shell、canvas、rail、surface 层级、交互状态、遮罩、状态色和图表色。
3. `packages/web/src/index.css` 中的 `--color-memora-*` 品牌变量只有浅色值，因此已经改用这些 token 的组件仍无法进入完整深色主题。
4. `settings.theme` 目前只参与存储、迁移和导入导出，没有生产代码消费它，也没有设置入口。
5. StyleX 组件中仍有大量浅色字面量。静态扫描在 `packages/web/src` 找到 110 个包含十六进制、RGB 或 HSL 颜色字面量的文件，共 1,458 处匹配；排除 `widgetBase.css`、`tokens.css`、`index.css` 和 `stylex.stylex.ts` 四个集中样式文件后，仍有约 1,230 处候选。这个数字包含阴影、数据可视化和真实媒体色，只能作为迁移上限，不能直接批量替换。
6. `packages/web/index.html` 和 PWA manifest 固定使用 `#09090b`，当前浅色界面也会得到深色浏览器状态栏或启动背景。
7. 主题 class 只挂在 AppLayout 子树时，挂载到 `body` 的 Base UI portal 可能无法继承变量；主题边界应位于 `document.documentElement`。

## 截图问题的直接原因

截图中的控件位于生成式 widget iframe。`packages/web/src/styles/widgetBase.css` 首先声明 `color-scheme: light dark`，随后在深色媒体查询中又设置 `color-scheme: light`，并把主要背景和文字 token 重置为浅色值。widget 自己的 CSS 可以根据 `prefers-color-scheme: dark` 把按钮或 chip 背景改成深色，但继承的文字 token 仍是浅色主题里的深色文字，于是出现深色背景配深色文字。

聊天 widget 和 Home Grid widget 都通过 `srcDoc` 注入 `widgetBase.css`，当前没有把 Memora 的显式主题选择传进 iframe。即使修正媒体查询，用户在“系统浅色 + Memora 深色”或“系统深色 + Memora 浅色”时仍会看到 iframe 与宿主不一致。

立即修复需要同时完成两件事：

- 为 widget 提供真实的深色 token，并移除深色媒体查询中的 `color-scheme: light`。
- 将解析后的应用主题传给聊天和 Home Grid iframe，可在构建 `srcDoc` 时写入 `data-theme`，并在运行时通过 `postMessage` 同步主题变化。

## 推荐架构

### 1. 单一主题解析器

增加 `resolveTheme(preference, systemPreference)`，输出 `light` 或 `dark`。主题偏好仍保存为三态：

| 设置     | 系统浅色 | 系统深色 |
| -------- | -------- | -------- |
| `light`  | light    | light    |
| `dark`   | dark     | dark     |
| `system` | light    | dark     |

`system` 模式需要监听 `matchMedia("(prefers-color-scheme: dark)")` 变化。显式 light/dark 不应受到系统切换影响。

### 2. 根节点主题边界

主题管理器应在 `document.documentElement` 同步：

- StyleX 的 light/dark/system theme class。
- `data-theme="light|dark"`，供现有 CSS、第三方库和 iframe 桥接使用。
- `style.colorScheme = "light" | "dark"`，让原生表单、滚动条和浏览器绘制的控件匹配主题。CSS `color-scheme` 的行为由 CSS Color Adjustment 规范定义。[CSS Color Adjustment](https://drafts.csswg.org/css-color-adjust-1/#color-scheme-prop)
- `<meta name="theme-color">`，让浏览器 chrome 跟随当前主题。

在 React 挂载前可以默认使用系统主题，避免系统深色用户先看到浅色闪烁。若需要让显式深色偏好也无闪烁，可以把非敏感的主题偏好镜像到 `localStorage`，由 `index.html` 中的短脚本在首帧设置根节点；LiveStore 仍是正式设置来源，启动后负责校准镜像值。

### 3. 完整语义 token

扩展 StyleX `defineVars`，至少覆盖：

- 页面层级：shell、canvas、rail、surface、surfaceSoft、surfaceMuted。
- 文字层级：text、textStrong、textMuted、textSoft、inverseText。
- 结构与交互：border、borderSoft、hover、hoverStrong、selected、focusRing、overlay、selection。
- 控件：controlBackground、controlBorder、controlDisabled、primaryButtonBackground、primaryButtonText。
- 状态：warning、danger、success、info 的 surface、border、text。
- 内容色：audio、video、image，以及图表序列色。
- 阴影：按主题分别设置的 shadow token，避免深色主题出现浅色纸张阴影。

StyleX `createTheme` 会覆盖同一套 `defineVars`，适合 Memora 的三态选择。`systemTheme` 可以在变量值中使用 `prefers-color-scheme`，`lightTheme` 和 `darkTheme` 则使用固定值。[StyleX createTheme API](https://github.com/facebook/stylex/blob/main/packages/docs/content/docs/api/javascript/createTheme.mdx)

现有 `--color-memora-*` 和 `--color-background-*` 需要逐步合并。迁移期可以保留一层别名，避免一次改动全部组件；最终应只保留一套语义来源。`light-dark()` 适合只跟随系统的 CSS，但 Memora 需要显式 light/dark 覆盖，因此它只能作为 token 内部实现手段，不能替代主题状态管理。[CSS `light-dark()`](https://drafts.csswg.org/css-color-5/#light-dark)

### 4. 特殊渲染边界

- Portal：主题 class 位于 `html`，确保对话框、菜单、toast 和 tooltip 继承相同变量。
- iframe：将解析后的 light/dark 值写入 iframe 根节点；主题变化通过消息同步。iframe 内保留独立 token 表，避免允许用户样式访问宿主 DOM。
- Canvas 和 Chart.js：从计算后的 CSS/StyleX token 读取颜色，主题变化后重新绘制 waveform、音频可视化和图表。
- CodeMirror、Lexical 和 Markdown 高亮：把编辑器主题对象中的字面量改成 token，并在主题切换时重配编辑器或使用 CSS 变量。
- PDF、PPTX、图片和视频：内容本身保持原貌，只适配预览器 chrome、遮罩、工具栏和空白画布。
- SVG：继续使用现有语义 ramp；补齐深色填充、描边和文字配对，避免只改变文字。

## 分阶段实施

### P0：修复可见错误

- 修正 `widgetBase.css` 的深色 token 和 `color-scheme`。
- 为聊天与 Home Grid iframe 增加主题输入和运行时同步。
- 增加 widget 深色主题浏览器测试，覆盖截图中的 chip/button 文字对比度。

### P1：接通主题状态

- 增加 `ThemeProvider` 或 `useThemeController`，消费 `settings.theme`。
- 补齐 `darkTheme` 和 `systemTheme`，把主题应用到 `document.documentElement`。
- 在设置页增加 Light、Dark、System 选择项。
- 同步 `theme-color`、`color-scheme` 和首帧主题。

### P2：迁移基础层

- 先迁移 AppLayout、Sidebar、Button、Input、Select、Switch、TabSelect、NativeDialog、ToastStack 和共享设置样式。
- 合并 `stylex.stylex.ts`、`index.css` 和 `tokens.css` 中重复的语义颜色。
- 为共享控件建立 light/dark 组件测试和 focus/disabled/hover 状态快照。

### P3：按功能区迁移

建议顺序：

1. Dashboard 与 Home Grid。
2. Desktop、窗口、菜单、搜索与设置。
3. Chat、Streamdown、代码块和 widget。
4. Transcript、音频、视频与 waveform。
5. 文档编辑器、CodeMirror、Lexical 和数学编辑器。
6. Onboarding、Playground 和开发工具。

每个功能区完成后再删除对应字面量，避免一次性大改导致难以定位回归。

### P4：约束和清理

- 增加 lint 或仓库检查，禁止组件样式新增未经允许的颜色字面量。
- 保留白名单：数据可视化 ramp、文件类型品牌色、真实媒体/SVG 艺术、透明黑白阴影。
- 删除不再使用的旧 token 和重复主题表。
- 修正 PWA manifest、浏览器状态栏和启动画面的主题策略。

## 验收与测试

### 自动化

- 单元测试：覆盖三态设置与两种系统偏好的六种组合，以及系统主题变化监听。
- 浏览器测试：使用 Playwright 的 `colorScheme` 模拟 light/dark，并分别验证 explicit light、explicit dark 和 system。[Playwright emulation](https://playwright.dev/docs/emulation#color-scheme-and-media)
- 视觉回归：为 onboarding、dashboard、desktop、search、settings、editor、chat、transcript 和 widget 建立浅色/深色截图。
- iframe 测试：检查宿主与聊天/Home Grid iframe 的 `data-theme` 一致，切换主题后计算样式同步。
- Canvas 测试：切换主题后验证重新绘制发生，绘制颜色来自 token。
- 可访问性：正文和交互文字优先满足 WCAG 2.2 AA 的 4.5:1，大号文字至少 3:1；焦点、禁用和状态信息不能只靠颜色表达。[WCAG 2.2 contrast minimum](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)

### 人工检查矩阵

- 主题组合：设置 light/dark/system × 系统 light/dark。
- 状态：default、hover、pressed、selected、focus-visible、disabled、loading、error。
- 渲染边界：普通 DOM、portal、iframe、canvas、SVG、代码高亮、原生表单。
- 窗口尺寸：桌面、窄屏和移动端。
- 内容：长文本、中英文、溢出、图片、音频、视频、PDF/PPTX 预览。

## 建议的完成标准

- 所有主要页面在显式 light、显式 dark 和 system 下呈现正确主题。
- 系统主题运行时切换能更新 system 模式，显式主题保持不变。
- portal、iframe、canvas 和编辑器与宿主主题一致。
- 深色主题仍保持暖灰和橄榄倾向，层级由亮度、边框和文字对比承担，不出现纯黑大面积背景或高饱和霓虹色。
- 共享组件的常用状态满足 WCAG AA 对比度目标。
- 新增组件颜色只能来自语义 token 或经过说明的固定色白名单。

## 建议拆分的后续改动

1. Widget 深色模式修复与 iframe 主题协议。
2. 全局 ThemeProvider、StyleX 三主题和设置入口。
3. 共享控件与应用外壳 token 迁移。
4. Dashboard/Desktop 功能区迁移。
5. Chat/Transcript/Editor 特殊渲染边界迁移。
6. 视觉回归、对比度检查和颜色字面量约束。
