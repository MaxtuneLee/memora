# 001 — 让标题标尺的横线展开并露出标题

- **Status**: DONE
- **Commit**: 444b3a9
- **Severity**: MEDIUM
- **Category**: Missed opportunity / performance / accessibility
- **Estimated scope**: 3 files, about 80 changed lines

## Problem

右侧标题标尺目前不是连续的“横线展开为标题”交互。`packages/web/src/components/editor/DocumentOutlineIndicator.tsx:145` 渲染了一根全高竖线，横线只放大到 `1.25` 倍，而标题只在 `hoveredHeading` 存在时挂载，因此会直接出现，无法与横线形成空间上的连续关系。

```tsx
/* packages/web/src/components/editor/DocumentOutlineIndicator.tsx:145 — current */
<div className="pointer-events-none absolute inset-y-0 right-3 w-px bg-[var(--color-memora-border-soft)]" />

/* packages/web/src/components/editor/DocumentOutlineIndicator.tsx:153-175 — current */
<span
  className="pointer-events-none absolute right-3 h-px origin-right bg-[var(--color-memora-text-soft)] transition-[background-color,transform,width] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none"
  style={{
    transform: `translateY(-50%) scaleX(${isHovered ? 1.25 : 1})`,
  }}
/>
{hoveredHeading ? <div>{hoveredHeading.title}</div> : null}
```

这是一个高频 hover 交互。它只需要一个小且可中断的状态过渡；竖线轴和“标题突然出现”都会削弱用户对当前标题的感知。

## Target

1. 删除竖线轴；所有横线共享同一个 `right: 0` 端点，不再视觉上附着到一根纵向轨道。
2. 每个标题标记都应渲染一份标题文本，标题默认不可见；不可在 hover 后才新增标题 DOM。
3. 仅在精细指针 hover 时，让当前横线以右端为原点向左扩展，并同步露出标题：

```css
/* target values */
.outline-marker {
  transform: translateY(-50%) scaleX(1);
  transform-origin: right center;
  transition:
    transform var(--duration-instant) var(--ease-out),
    background-color var(--duration-instant) var(--ease-out);
}

.outline-title {
  opacity: 0;
  transform: translateX(4px);
  transition:
    opacity var(--duration-instant) var(--ease-out),
    transform var(--duration-instant) var(--ease-out);
}

@media (hover: hover) and (pointer: fine) {
  .outline-item[data-hovered="true"] .outline-marker {
    transform: translateY(-50%) scaleX(8);
  }

  .outline-item[data-hovered="true"] .outline-title {
    opacity: 1;
    transform: translateX(0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .outline-marker,
  .outline-title {
    transition-property: opacity, background-color;
  }
}
```

4. 保持标题实际文档位置不变。所谓“放一起”指所有横线共用同一右侧对齐端点，不是把不同章节堆叠到同一垂直坐标；否则会失去篇幅和章节位置的信息。
5. 点击行为、屏幕阅读器导航以及 `H1`–`H6` 的完整覆盖必须不变。

## Repo conventions to follow

- 动效 token 在 `packages/web/src/index.css:11-18` 的 `@theme` 中定义，已有 `--duration-instant: 140ms` 与 `--ease-out-quart` 等 token。
- 在同一 `@theme` 中新增 `--ease-out: cubic-bezier(0.23, 1, 0.32, 1);`。这是该高频小型状态过渡的唯一新 token；不要在 JSX 内手写 cubic-bezier。
- 现有编辑器返回按钮使用 token 化 transform 过渡，可参考 `packages/web/src/components/editor/MarkdownDocumentEditor.tsx:182`。
- 用 CSS transition，不使用 keyframes。鼠标快速跨越多个标题时，transition 必须从当前状态重新定向。

## Steps

1. 在 `packages/web/src/index.css` 的 `@theme` 中添加：

   ```css
   --ease-out: cubic-bezier(0.23, 1, 0.32, 1);
   ```

   保留所有既有 token，不改动其他组件的 easing。

2. 重构 `packages/web/src/components/editor/DocumentOutlineIndicator.tsx` 的标尺标记 JSX：

   - 删除全高竖线 `<div className="... inset-y-0 ..." />`。
   - 将每个标题标记和其标题文本放入同一个绝对定位的、带 `data-hovered` 属性的容器；容器的 `top` 保持 `heading.position`。
   - 所有横线使用相同的 `right-0` 对齐端点；继续根据 `heading.level` 使用 `getMarkerWidth` 区分横线长度。
   - 在该容器内始终渲染标题 `<span>`，只用 `opacity` 和 `transform: translateX(4px)` 隐藏。删除依赖 `hoveredHeading ? ... : null` 的独立标题浮层。
   - 横线在 hover 时以 `transform-origin: right center` 应用 `scaleX(8)`；标题同时以 `opacity: 1` 和 `translateX(0)` 出现。所有 transition 使用 `var(--duration-instant)` 与 `var(--ease-out)`。
   - 当前章节色仍为 `var(--color-memora-olive)`；hover 标题不应添加阴影、卡片背景或新的边框。

3. 交互边界：

   - 保留现有透明命中按钮和“根据指针 Y 坐标取最近标题”的逻辑，确保密集标题仍能选择。
   - 不修改 `onNavigate`、`parseMarkdownHeadings`、CodeMirror 的 `revealLine` 或 Preview 的 `revealHeading`。
   - 在触摸设备上不运行 hover 展开；点击仍应根据当前指针位置定位标题。
   - `prefers-reduced-motion: reduce` 下标题仍立即变为可见，但不执行横线扩展和横向位移。

4. 在 `packages/web/test/editor/DocumentOutlineIndicator.test.ts` 中增加渲染测试，覆盖：

   - 标尺渲染时没有竖线轴元素或轨道类名。
   - 每个传入标题在 DOM 中都有对应的可访问导航项。
   - hover 状态通过当前标题容器上的数据属性改变，而不是通过挂载/卸载独立标题浮层实现。

## Boundaries

- 不要修改 `packages/web/src/components/editor/MarkdownDocumentEditor.tsx`、`SourceDocumentEditor.tsx` 或 `WysiwygDocumentEditor.tsx`。
- 不要添加动画库或其他依赖。
- 不要动画化滚动、键盘导航、标题解析或编辑器内容变化。
- 不要对标题标尺加入弹簧、bounce、stagger、模糊或阴影效果。
- 如果标尺 JSX 在执行时已不符合本计划记录的提交版本，停止实施并报告差异，不要自行扩大范围。

## Verification

- **Mechanical**:

  ```bash
  cd /Users/maxtune/workspace/personal/memora/packages/web
  vp test test/editor/DocumentOutlineIndicator.test.ts test/editor/SourceDocumentEditor.test.tsx
  vp exec tsc -b
  vp lint
  ```

  定向测试必须通过。若后两个命令仍因工作区既有 `.void`/`livestore-devtool` 配置或无关测试失败，记录其输出，并确认没有来自上述三个改动文件的错误。

- **Feel check**:

  1. 使用包含至少 10 个混合层级标题的长 Markdown 文档，在桌面精细指针上从一个标记快速移向另一个标记。
  2. 确认只有当前横线向左延伸、标题在同一位置露出；移开时它们能从中间状态平滑收回，不闪烁。
  3. 确认标尺区域没有贯穿顶部到底部的竖线，所有横线的右端整齐对齐。
  4. 在 Chrome DevTools Animations 面板以 10% 速度检查：横线从右端伸出，标题仅淡入并向左移动 4px；不出现 `scale(0)`、布局跳动或两个标题重叠。
  5. 打开 DevTools Rendering 的 `prefers-reduced-motion`：标题显示/隐藏仍可理解，但横线不扩展、标题不横向移动。
  6. 使用屏幕阅读器或 Tab 键确认“所有文档标题”导航仍能逐项访问，并在 Enter 后定位对应章节。

- **Done when**: 标题标尺没有竖线轴；全部标题保留在同一右侧对齐列；hover 时可见一个由横线扩展和标题显现组成的连续、140ms、可中断过渡。
