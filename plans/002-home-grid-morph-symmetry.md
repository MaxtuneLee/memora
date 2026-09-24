# 002 — 让 Home Grid 编辑按钮的收起动画与展开动画完全对称

- **Status**: DONE（机械验证已通过；feel check 待人工确认）
- **Commit**: 9f8fc63
- **Severity**: HIGH
- **Category**: Easing & duration / Interruptibility / Physicality
- **Estimated scope**: 1 file (`packages/web/src/components/dashboard/DashboardPage.tsx`)，净删除为主

## Problem

Home Grid 工具栏的 Edit ↔ Done 变形里，收起（retract）走的是和展开（extrude）不同的时间线。展开是一条连续曲线，收起被拆成「先冻结、再突变」，所以有顿感。四处不对称，全部在 `packages/web/src/components/dashboard/DashboardPage.tsx`：

**1. 一个假的「反向」缓动常量**

```ts
// packages/web/src/components/dashboard/DashboardPage.tsx:82-86 — current
// Retracting is the extrude played backwards, so it reuses these targets and only mirrors the
// curve. Reversing a cubic-bezier is [1 - x2, 1 - y2, 1 - x1, 1 - y1]; running ACTION_SPLIT_EASE
// forwards again would make the pill leave fast and arrive slow, the opposite of how it came out.
const ACTION_SPLIT_EASE_REVERSED = [0.23, 1, 0.32, 1] as const;
```

它的值和 `ACTION_SPLIT_EASE`（`:68`）逐字节相同，但注释仍声称是镜像曲线。常量是死的，注释是错的，维护者会被误导。

**2. label 退出带 350ms 延迟 —— 顿感的直接来源**

```ts
// packages/web/src/components/dashboard/DashboardPage.tsx:400-404 — current
const labelExitTransition = {
  delay: ACTION_MORPH_DURATION * (1 - ACTION_MORPH_LABEL_RATIO),
  duration: ACTION_MORPH_DURATION * ACTION_MORPH_LABEL_RATIO,
  ease: ACTION_SPLIT_EASE_REVERSED,
};
```

`0.5 × 0.7 = 0.35s`。收起时「Add widget」文字原地不动 350ms，然后在最后 150ms 里突然消失。展开方向没有任何 delay。一个先停后跳的分段时间线就是用户说的顿感。

**3. 没有任何 overflow 裁剪，两个方向的溢出行为因此不一致**

```ts
// packages/web/src/components/dashboard/DashboardPage.tsx:155 — current
actionMotionPill: { flexShrink: 0, whiteSpace: "nowrap" },
```

pill 按钮从约 145px 收到 `ACTION_MORPH_TUCK = 44`，但内容 `white-space: nowrap` 且没有裁剪。展开方向看不出问题，因为 label 从 `opacity: 0` 起步；收起方向因为上面的 delay，label 在按钮已经缩掉一半时仍是全不透明，约 100px 的内容直接溢出按钮外。这正是「一样的 overflow hidden」要解决的：内容必须在两个方向上都被按钮自身裁掉。

**4. toggle 在收起结束时硬切 —— 第二个顿感来源**

```ts
// packages/web/src/components/dashboard/DashboardPage.tsx:405-409 — current
// The metaball only thresholds alpha; RGB passes through the blur untouched, so a bridge between
// two #fffdfa pills on a #fcfaf6 page is invisible. The dark primary tone is what makes the goo
// readable, and the toggle used to drop it 150ms into a 1s retract. Holding it for the morph is
// also the honest reverse: the extrude turns the toggle dark at its first frame.
const isToggleShowingDone = isHomeGridEditing || isHomeGridActionMorphing;
```

用在 `:798`（`tone`）、`:805`（label 的 `key`）、`:818`（label 内容）。收起时 toggle 整整保持深色 "Done" 500ms，然后在计时器归零的那一帧瞬间跳成浅色 "Edit"。连续运动末尾的离散跳变，同样是顿感。

这个常量存在的真实原因是对比度：metaball 滤镜（`:717` 的 `feColorMatrix values="… 18 -7"`）只对 alpha 做阈值，RGB 原样穿过高斯模糊，所以两个 `#fffdfa` 胶囊在 `#fcfaf6` 背景上连出来的桥差异只有约 3/255，肉眼不可见。深色 `#4f5742` 的 primary tone 才让流体桥可见。因此不能简单删掉它换回瞬时切换 —— 必须用连续的颜色过渡替代离散的保持＋跳变。

## Target

一条时间线，正放是展开，倒放是收起。没有 delay、没有单独的 exit transition、没有末尾跳变、两个方向同一条 `ACTION_SPLIT_EASE`。

```ts
/* target — 常量区 */
const ACTION_SPLIT_EASE = [0.23, 1, 0.32, 1] as const; // 保持不变，唯一的曲线
// ACTION_SPLIT_EASE_REVERSED 删除
```

```ts
/* target — 组件内，pillExitTransition / labelExitTransition / isToggleShowingDone 全部删除 */
// exit 直接复用组件级 transition，与 initial/animate 同曲线同时长
```

```ts
/* target — styles */
// 内容被按钮自身的 padding box 裁掉；overflow 不裁剪元素自己的 border 与 box-shadow，
// 所以胶囊轮廓、1px 描边、hover 阴影都不受影响，圆角会让裁剪沿曲线走。
actionMotionPill: { flexShrink: 0, overflow: "hidden", whiteSpace: "nowrap" },
```

```ts
/* target — toggle 上的连续色彩过渡，只在变形期间接管 */
// DashboardToolbarButton.tsx:27 自带 transitionDuration: "150ms"，
// transitionProperty 已含 background-color / border-color（:28）。
// 变形期间把时长拉到与 morph 一致、曲线换成同一条，tone 的深浅就变成连续过渡而非硬切。
style={
  isHomeGridActionMorphing && !reducedMotion
    ? {
        transitionDuration: `${ACTION_MORPH_DURATION * 1000}ms`,
        transitionTimingFunction: `cubic-bezier(${ACTION_SPLIT_EASE.join(",")})`,
      }
    : undefined
}
```

`tone` / label 的 `key` / label 内容三处改回直接读 `isHomeGridEditing`。

## Repo conventions to follow

- 缓动 token 已存在于 `packages/web/src/index.css:8`：`--ease-out: cubic-bezier(0.23, 1, 0.32, 1);`。`ACTION_SPLIT_EASE`（`DashboardPage.tsx:68`）就是它的 JS 副本 —— 不要新增曲线常量。
- 样式一律走 StyleX `stylex.create`，见 `DashboardPage.tsx:150` 起的 `styles` 对象；不要引入 CSS 文件或内联样式表达静态样式。
- 同文件的 `ACTION_REDUCED_MOTION_DURATION = 0.16`（`:80`）是 reduced-motion 的统一时长，保持所有分支都尊重 `reducedMotion`。
- 已经写对的范例：`DashboardPage.tsx:736-746` 的 pill `initial` / `animate` 直接复用 `ACTION_PILL_TUCKED` / `ACTION_PILL_OPEN` 两个共享常量 —— exit 应当同样只引用常量，不再附带自己的 `transition`。

## Steps

1. `DashboardPage.tsx:82-86` — 删除 `ACTION_SPLIT_EASE_REVERSED` 常量及其上方 3 行注释。
2. `DashboardPage.tsx:396-404` — 删除 `pillExitTransition` 与 `labelExitTransition` 两个对象。
3. `DashboardPage.tsx:405-409` — 删除 `isToggleShowingDone` 常量及其上方 4 行注释。
4. `DashboardPage.tsx:758` — 把 pill 的 exit 从 `{ ...ACTION_PILL_TUCKED, transition: pillExitTransition }` 改为 `ACTION_PILL_TUCKED`。
5. `DashboardPage.tsx:774` — 把 label 的 exit 从 `{ ...ACTION_LABEL_HIDDEN, transition: labelExitTransition }` 改为 `ACTION_LABEL_HIDDEN`。
6. `DashboardPage.tsx:155` — `actionMotionPill` 加 `overflow: "hidden"`，结果为 `actionMotionPill: { flexShrink: 0, overflow: "hidden", whiteSpace: "nowrap" }`。键按字母序排列以匹配该 `styles` 对象的既有写法。
7. `DashboardPage.tsx:798 / :805 / :818` — 三处 `isToggleShowingDone` 全部改回 `isHomeGridEditing`。
8. `DashboardPage.tsx:795-799` 的 toggle `<DashboardToolbarButton>` — 加上 Target 段里那个 `style={...}` 表达式，让 tone 的颜色在变形期间连续过渡。`isHomeGridActionMorphing` 状态已存在（`:250` 声明，`:401` 附近的 effect 里设置），不要新增状态。

## Boundaries

- 不要改 `packages/web/src/components/dashboard/DashboardToolbarButton.tsx` —— 它的 150ms 默认过渡服务于所有工具栏按钮，只能在本页由调用方临时覆盖。
- 不要改 `ACTION_MORPH_DURATION`、`ACTION_MORPH_TUCK`、`ACTION_MORPH_GAP`、`ACTION_MORPH_LABEL_RATIO` 的数值，也不要改 metaball 滤镜（`:710-721`）的任何参数。
- 不要改 DOM 结构、`AnimatePresence` 的用法、`MotionToolbarButton` 的定义，也不要动 `zIndex`/负 margin 的 tuck 机制。
- 不要新增依赖。
- 如果某一步对不上实际代码（相对 commit 9f8fc63 已漂移），停下来报告，不要自行发挥。

## Verification

- **Mechanical**:
  - `pnpm --filter @memora/web lint` —— 不得出现 `DashboardPage` 相关的 error。
  - `cd packages/web && npx tsc --noEmit -p tsconfig.app.json` —— 除既有的 `void/env`、`.void/db.d.ts` 两条生成文件报错外无新增错误。
  - 全文件 `rg -n "ACTION_SPLIT_EASE_REVERSED|pillExitTransition|labelExitTransition|isToggleShowingDone"` 应无任何命中。
- **Feel check**（`vp run -t @memora/web#dev`，首页需至少有一个 widget 才会出现 Edit 按钮）：
  - 点 Edit 展开、点 Done 收起，来回若干次：收起过程中「Add widget」文字不得在任何一帧超出胶囊轮廓。
  - 收起过程中 toggle 的深绿 → 米白是渐变的，不存在某一帧的整块突变。
  - 「Add widget」文字不得出现先静止再消失的分段感 —— 它应当从第一帧就开始淡出。
  - 在动画进行到一半时立刻点反向按钮，运动应从当前位置接续，不得跳回起点或闪一下。
  - DevTools → Animations 面板把播放速度调到 10%，确认展开与收起是同一条曲线的正放与倒放：两个方向都应起步快、收尾慢。
  - DevTools → Rendering 打开 `prefers-reduced-motion: reduce`，确认只剩透明度变化，没有宽度/位移动画。
- **Done when**: 四个不对称点全部消除，`rg` 查无残留符号，且上述 feel check 全部通过。

## 附注（不在本计划范围内，供后续决策）

`ACTION_MORPH_DURATION = 0.5`（500ms）。按 AUDIT 的时长预算，下拉/选择类控件是 150–250ms，模态/抽屉才到 200–500ms。这个 toggle 属于每天会点若干次的工具栏控件，500ms 偏长；顿感修掉之后如果仍觉得拖沓，可单独提一个计划降到 0.22–0.25。本计划不改它，因为该值是使用者明确设定的。
