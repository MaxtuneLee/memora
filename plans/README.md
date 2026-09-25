# Animation plans

| #   | Plan                                                                                 | Severity | Status |
| --- | ------------------------------------------------------------------------------------ | -------- | ------ |
| 001 | [让标题标尺的横线展开并露出标题](001-outline-line-to-title.md)                       | MEDIUM   | DONE   |
| 002 | [让 Home Grid 编辑按钮的收起动画与展开动画完全对称](002-home-grid-morph-symmetry.md) | HIGH     | DONE   |

按编号执行。001 无其他计划依赖；它只改动标题标尺及其动效 token，不应与编辑器定位逻辑合并。

002 同样独立，只改 `DashboardPage.tsx` 一个文件，与 001 无重叠。它以删除为主：移除收起方向自带的 exit transition、延迟与末尾硬切，让两个方向共用同一条 `ACTION_SPLIT_EASE`。附注里提到的时长下调（500ms → 250ms）如果要做，应在 002 完成之后单独开 003，不要并入。
