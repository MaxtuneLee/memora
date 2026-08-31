# 功能级模型配置改造进度

分支：`codex/playground-content-pipeline-plan`。本次未修改 main 工作区的用户改动，未提交或部署。

## 约束

- 主聊天只使用云端，类型、配置解析和实际聊天执行器均保留此限制。
- API key 只写设备本地的 `Events.clientOnly` 事件，不进入 provider 的 synced events，不进入应用导出备份。
- 功能失败时不自动从本地切换到云端，也不在无效配置下继承已有云端配置。
- 纯客户端：用户已明确拒绝新增后端接收凭据或转发音频。无需再请求此方案的批准。
- 转写当前只做本地 Whisper 与 ElevenLabs Scribe；Qwen Realtime 暂不接入，技术限制只在开发沟通中说明，不新增页面说明。图片、公式、嵌入继续暂缓。

## 已实现

- `livestore/provider.ts`：provider v2 创建和更新事件只包含元数据；保留 v1 名称用于历史重放，旧凭据字段不再进入 provider 表。请求头和任意 sampling 参数不复制到模型元数据。
- `livestore/providerCredential.ts`：独立本地凭据表、写入和删除事件；凭据同时绑定 provider ID 和端点，端点变更不会自动使用旧端点的 key。
- 设置、onboarding、主聊天、模型列表读取使用独立本地凭据；表单拒绝在 URL 用户信息或查询参数中携带凭据。
- `lib/models/modelRouting.ts`、`lib/models/modelRoutingSchema.ts`、`livestore/setting.ts`：设备级功能配置统一保存在 `settings.modelRouting`，兼容旧聊天选项。配置随 `settings.json` 导出/恢复，凭据不导出；旧独立配置文件仍可导入。
- 设置增加 Models by feature：主聊天固定云端；性格生成、会话标题、记忆偏好提取可选择本地、云端或沿用聊天模型。每项说明数据处理位置。
- 三个辅助文本功能注入各自配置的执行器；记忆提取使用本地模型时不要求云端 key。
- onboarding 先配置服务商，再选择主聊天和性格生成模型。只检查所选性格模型的本地缓存，不再强制下载 Whisper。已完成 onboarding 的用户不会因为缓存清理被送回引导。
- 共用 Select 修正可见控件与 label 的关联，以及值到显示名称的映射。

## 尚未完成

| 功能 | 当前状态 | 后续工作 |
| --- | --- | --- |
| 文件及实时语音转写 | 统一接口、Whisper 与 Scribe 适配器已实现；本地入口已迁移；Qwen 分支已移除 | 接通 Scribe 浏览器直接换 token、录音持续会话、provider 配置及设置/onboarding 选择 |
| 图片与扫描页识别 | 用户明确本阶段不做 | 保留现有处理，本阶段不继续 |
| 公式识别 | 用户明确本阶段不做 | 保留现有处理，本阶段不继续 |
| 语义嵌入 | 用户明确本阶段不做；工作树保留此前未完成改动，开关默认关闭 | 本阶段不继续实现；本次只修复此前代码的一处类型签名 |

功能注册表预留了上述条目，但设置页面只展示已接通的四个文本相关功能，避免无效开关。

## 转写第一阶段

- `lib/transcript/providers/types.ts`：能力查询、PCM 输入、部分/最终结果、稳定段 ID 和 revision，以及 write/commit/finish/abort 生命周期。
- 本地 Whisper 和 ElevenLabs Scribe 两个适配器。早期 Qwen Realtime 原型已按最新范围移除，不影响聊天侧 Qwen 模型。
- Scribe 等待已提交段及延迟词级时间戳。连接超时、尾段缺失、取消和断线不会被当作成功。错误事件不回显服务商原始错误内容。
- `useFileTranscription` 使用统一接口，默认本地，可由调用方注入 provider；一次任务固定执行配置。重置和卸载会取消工作，保存前检查取消。现有录音 Whisper 兼容层也调用同一本地适配器，仍保留 VAD/队列的原有接口。
- `toRecordingTranscript` 保留无时间戳文本，不制造跳转时间点。现有录音文件格式保持不变。
- `createScribeConnection` 接收客户端注入的临时 token 获取函数，不接收长期 API key。没有新增代理服务器、token 签发端点或真实音频上传。
- 扩展约定、已知边界及官方协议链接见 `packages/web/src/lib/transcript/providers/README.md`。

## 转写配置衔接

- 新增统一转写运行时解析器：根据功能目标选择本地适配器或调用宿主提供的云端账号解析器，按实际模型能力选择时间戳模式；解析过程不建立网络连接。
- 文件入口在点击时读取设备的功能配置。录音在准备模型及申请麦克风前校验该配置。明确选择云端但未配置连接时，两条路径均报错，不静默回退到 Whisper。
- 录音页显示配置错误、可访问的错误提示和重试按钮；修正为本地选择后可重试准备模型。
- 本轮 6 个定向测试文件共 41 项用例通过，覆盖运行时选择、点击时读取、麦克风前校验、错误恢复、原协议适配器及录音页交互。尚未改变云端鉴权部署边界。

## 权限与验证说明

早期云端转写补丁曾被权限检查拒绝，未落盘。用户随后要求开始转写实现，明确只做纯客户端，并暂缓 Qwen Realtime。此前“需要新增应用后端签发 Scribe token”的判断已修正：后续由浏览器使用用户自己的 key 直接调用 ElevenLabs 官方 token 接口，再连接其 WebSocket。无凭据 CORS 预检已通过，尚未用真实 key 验证完整链路；不再以应用后端授权为阻塞条件。

构建 `vp run -t @memora/web#build` 已通过。8 个相关测试文件共 38 项用例已通过（控件修正后单独复测其 2 项）；覆盖凭据、路由、辅助运行时、onboarding、原有本地模型逻辑，以及主聊天固定云端和性格模型切换的控件交互。真实浏览器视觉检查和真实模型端到端调用尚未完成。

本阶段转写：应用构建再次通过，5 个定向测试文件共 25 项用例通过；包括 4 个新增测试文件的 23 项及已有 speechBuffer 的 2 项。使用模拟 PCM、模型和 WebSocket，不连接真实服务商。相关文件定向 lint 未报错。最初通过 package script 传参意外展开为全量测试，出现模型适配器/公式编辑器等非转写失败，已中止该次运行；不能据此声称全量测试通过。

完整 TypeScript 检查仍有两个本次改动前存在的问题：`test/dashboard/todoDocument.test.ts:162` 的 never 调用、`test/library/fileIcon.test.ts:2` 的 vitest 模块引用。没有为这些无关问题添加依赖或更改测试。

## 配置存储合并与浮层修复

- 移除独立 `ai_model_routing` 表，新修改通过已有 `settingsSet` 本地事件保存。`legacyModelRouting.ts` 仅保留旧配置事件回放，将各功能选择写入 settings，不重新创建旧表。
- 更新单个功能时读取最新 settings，保留其他功能配置和无关设置；聊天仍只支持云端，凭据仍独立保存且不进入 synced events。
- 配置合并相关 12 个测试文件共 50 项通过，涵盖旧事件回放、新旧备份、连续更新、转写读取和凭据隔离。应用类型检查只有此前记录的两处测试错误。
- Select 下拉层挂载到触发器所属的原生 dialog；Toast 跟随最近打开的 NativeDialog，关闭、卸载或嵌套弹窗退出时恢复到上一层。沿用现有视觉样式，不通过提高页面 z-index 解决顶层问题。
- NativeDialog 仅在按下和点击都落在背景时关闭，避免 Select 打开时点击目标变化导致设置弹窗误关；指针取消时清除标记。
- 浮层与设置组件相关 4 个测试文件共 14 项通过，包含 Select 点击重定向回归测试、真实背景点击关闭、Toast 在嵌套弹窗间迁移和卸载恢复。相关文件 lint、格式检查通过；应用类型检查仍只有上述两处既有测试错误。
- Chrome 能发现当前 Memora 页面，但读取页面时连接超时；本次最后修复尚未完成 Chrome 实测。

## 模型选择、下载卡片和本地 token 统计

- onboarding 下载卡片使用所选模型的实际名称和模型标识，移除将非 Gemma 模型描述为转写模型的旧判断；Qwen、Gemma 切换及对应下载按钮、状态已测试。
- Personality 与 Conversation titles 默认使用 `Follow chat model`。已有显式本地或云端选择保持不变。
- 云端 Model 使用公共 Select，自动请求所选服务商配置地址的 `/models`。设置与 onboarding 共用获取逻辑，支持加载、空列表、重试和刷新；并发请求合并，切换服务商后忽略旧响应，保留已有选择。凭据仅来自当前设备且必须匹配服务商地址，只有经过筛选的模型元数据进入原有 provider 更新事件。
- 公共 Select 关闭 `alignItemWithTrigger`，采用锚定触发器的定位；选项 List 按可用高度限制滚动并使用 overscroll containment。公共 Select、Toast、NativeDialog 的 3 个测试文件共 13 项通过；没有完成本轮真实浏览器滚动实测。
- Models by feature 顶部新增 `Tokens saved with local models`。Qwen 与 Gemma 使用实际输入 token tensor 和输出 token IDs 上报用量，功能级本地运行时仅在正常迭代完成后记账；失败、取消、重复 usage 事件不会重复累计，云端、下载与 ASR 不计入。
- 累计值保存在现有 `settings.localModelTokenUsage`，通过 `v1.LocalModelUsageRecorded` client-only 事件原子增加输入/输出计数，不新增数据库表。顶部显示两者总和，备份可恢复计数；无历史记录从 0 开始，不估算过去调用或云端账单。
- 最新统计、真实计数适配、功能运行时、归档和默认路由共 6 个测试文件 30 项通过；此前模型列表与设置回归共 8 个文件 33 项通过。相关 lint、格式及 diff 检查通过。
- 扩展回归发现既有 `gemma4Adapter.test.ts:27` 期望首条消息为用户消息，而 HEAD 中的实现已先添加系统消息；本轮未改该行为。应用类型检查仍只有此前记录的两处测试错误。没有发起真实模型下载或向实际服务商发送测试请求。

## 四项统计与本地模型下载提示（2026-08-29）

- Models by feature 顶部改为四行：Total commands、Input tokens、Output tokens、Tokens saved。调用次数使用千分位，token 数使用 K/M 紧凑格式，沿用现有主题颜色、间距和分隔线。
- 每次成功的功能级本地模型调用在原有 client-only 用量事件中原子增加一次调用计数；不增加同步事件或数据库表。备份保留调用次数；旧备份只有 token 总量时，调用次数显示为未知，不伪造历史。
- Tokens saved 使用本地模型成功调用的 input 与 output token 之和；百分比按 `saved tokens / 所有本地和云端成功调用的 input 与 output token 之和` 计算，保留一位小数。Input tokens 与 Output tokens 展示相同范围内的全部调用总量。Pi 流只在成功完成后读取最终 message usage，取消和错误不计入。
- 在设置或 onboarding 切换为本地执行、切换本地模型时检查实际模型缓存；未下载时发出 Toast，已缓存时不提示。切回云端、后续选择或组件卸载后忽略旧检查结果；不自动下载或回退云端。
- 最终联合回归 9 个测试文件 40 项通过，覆盖下载提示、设置、onboarding、Toast、本地及云端统计、百分比、旧数据兼容、归档与功能运行时。AI provider 包构建及已有运行时测试通过，相关定向 lint 和 diff 检查通过；完整类型检查仍只有此前记录的两处测试错误。未进行真实模型下载、真实云端调用或浏览器端到端验证。

## 设置侧栏样式隔离（2026-08-29）

- 设置侧栏 DOM 一直存在。PPTX viewer 的样式包包含另一份全局 Tailwind utilities，后加载的 `.hidden` 与 `.flex` 覆盖了设置弹窗的 `md:block` 与 `md:grid`，导致桌面侧栏和移动端 Sections 入口同时不可见。
- 将 `pptx-react-viewer/styles` 通过独立样式入口放入低优先级 `pptx-viewer` cascade layer，并在应用主样式中显式声明层级顺序；PPTX 组件继续共用同一份样式，不新增特殊颜色或布局规则。
- Chrome 完整刷新后确认弹窗恢复两列 grid，左侧导航为 216px 且 10 个入口可见；移动端入口在桌面断点保持隐藏。设置布局测试与 Web 生产构建通过。尝试运行既有 document parsing 测试时，测试环境因缺少 `DOMMatrix` 在收集阶段失败，本轮未修改该测试环境。

## LiveStore OPFS 文件池恢复（2026-08-29）

- 启动失败发生在 LiveStore migration 之前。`@livestore/sqlite-wasm@0.3.1` 的 AccessHandlePoolVFS 初始容量固定为 6，schema hash 变化产生的旧 state DB 会继续占用关联槽位；槽位用完后，新 state DB 在 `jOpen` 阶段抛出 `cannot create file`，随后 SQLite 报 `unable to open database file`。
- 通过 pnpm patch 修改 VFS 初始化：每次启动计算已用容量，并确保至少保留 6 个可用槽位。已有路径、state DB、eventlog、storeId 和本地凭据均保留，不清理或迁移 OPFS 内容。
- 离线 frozen-lockfile 安装通过，Web 生产构建通过。Chrome 打开并刷新 `http://localhost:9001/playground` 后应用正常启动，控制台未再出现上述 OPFS 或 SQLite 错误，只剩浏览器扩展产生的 warning。

## LiveStore 0.4.0 迁移（2026-08-29）

- 所有直接 LiveStore 依赖统一到 0.4.0，`@livestore/wa-sqlite` 使用新的 LiveStore 版本号；移除 0.3.1 的 sqlite-wasm 本地补丁，改用 0.4.0 上游的有界开发 state DB 归档修复。
- React 根节点改用单例 `StoreRegistry`、`StoreRegistryProvider` 和 Suspense；稳定的 store options 集中在 `livestore/store.ts`。项目 hook 统一使用 `useAppStore()`，适配 0.4.0 中 `useStore(options)` 直接返回 store 的行为。
- 原加载进度通过 `onBootStatus` 和 `useSyncExternalStore` 保留。自定义 devtool 改为接收 SQL 查询与执行适配函数，不再调用已删除的无参数 `useStore()`；OPFS 统计按 `livestore-devtools_` 前缀排除版本化目录。
- 功能分支与当前运行的主 checkout 均完成生产构建。迁移相关 6 个测试文件 21 项通过；应用源码类型检查没有新增 LiveStore 错误，仅保留既有测试类型错误。关闭升级前的旧标签并新开 Chrome 标签后，现有 OPFS 数据正常进入 Playground，控制台无 LiveStore 启动错误。

## 历史凭据迁移注意事项

移除字段不能删除已经同步过的历史事件或旧备份。旧 key 不自动导入新的本地凭据表，用户需要在当前设备重新填写；曾经进入同步历史的 key 应在服务商处轮换。上线时还需要协调旧客户端升级与同步端历史数据处理，不能声称旧秘密已经被彻底清除。
