# 浏览器端 Hugging Face 数据集加载与 ASR 评测

## Problem Statement

Memora 需要在浏览器中用真实数据集评测端侧模型。目前的数据加载和 benchmark 分散在应用内部，缺少可复用的 dataset 接口。开发者无法方便地选择 Hugging Face 数据集的 configuration 和 split、查看下载大小、保存到 OPFS，然后逐条调用模型并获得可检查的结果。

首版目标是一条完整路径：从公开 Hub 获取数据集，保存到本地，运行端侧 ASR，返回并保存逐条结果和 WER/CER 汇总。FLEURS 的 hi_in/test 是验收案例。首版规模以一个约 306 MB、418 条 example 的 split 为参考，不建设长期后台任务或通用数据平台。

## Solution

提供内部 workspace 包 @memora/datasets 和 @memora/evaluation，并在 Memora Web 中提供数据集选择与评测界面。用户输入公开 Hub dataset ID，查看 configuration、split、example 数量和下载大小，选择 split 并下载。安装完成后可重复使用 OPFS 中的数据，选择已支持的端侧 ASR 模型运行评测，查看进度、逐条转写、错误与汇总，并保存或下载结果 JSON。

数据集接口借鉴 Hugging Face 的 dataset/configuration/split/feature 概念，使用 TypeScript 异步调用与异步迭代。数据读取、Parquet 解析和评测计算在 dataset/evaluation SharedWorker 中执行，Window 桥接现有模型 SharedWorker。两个新包均不反向依赖 Web。

## User Stories

1. As an 评测使用者, I want 输入公开 Hub dataset ID, so that 我能获取现有评测数据。
2. As an 评测使用者, I want 查看 configuration 及各 split, so that 我能选择语言和评测分区。
3. As an 评测使用者, I want 下载前查看 example 数量和字节大小, so that 我能判断下载成本。
4. As an 评测使用者, I want 按 split 勾选并查看合计大小, so that 我无需下载无关的训练集。
5. As an 评测使用者, I want 查看下载进度并取消下载, so that 我能控制等待和资源使用。
6. As an 评测使用者, I want 网络失败后重新下载未完成文件, so that 我能完成安装。
7. As an 评测使用者, I want 完成的数据保存到 OPFS, so that 后续评测可以复用本地数据。
8. As an 评测使用者, I want 空间不足时收到明确错误, so that 我能清理空间后重试。
9. As an 评测使用者, I want 查看和显式删除本地安装, so that 我能管理存储占用。
10. As an 开发者, I want inspect、install、open 分阶段 API, so that 我能实现下载选择界面。
11. As an 开发者, I want 简洁的 loadDataset 入口, so that 示例代码能方便地加载单个 split。
12. As an 开发者, I want 异步迭代 example 和 batch, so that 模型可以逐步消费数据。
13. As an 开发者, I want 获取 feature schema 和 class label 名称, so that 我能解释字段与标签。
14. As an 开发者, I want 媒体按需读取, so that 普通数据访问不会提前解码全部音频。
15. As an 评测使用者, I want 选择现有 ASR 模型并运行 FLEURS, so that 我能测量真实识别效果。
16. As an 评测使用者, I want 运行过程中继续操作页面, so that 数据处理不会阻塞界面。
17. As an 评测使用者, I want 看到已完成数量并能取消评测, so that 我能掌握和控制运行过程。
18. As an 评测使用者, I want 查看逐条 prediction、reference、错误和耗时, so that 我能分析具体识别问题。
19. As an 评测使用者, I want 查看 WER、CER 和成功失败数量, so that 我能判断结果质量与覆盖程度。
20. As an 评测使用者, I want 结果包含 dataset revision 和模型配置, so that 我能解释不同运行的差异。
21. As an 评测使用者, I want 保存并下载结果 JSON, so that 我能保留记录和做进一步分析。
22. As an 开发者, I want 注入窄的 ModelAdapter, so that 数据集和评测包不依赖特定应用。
23. As an 开发者, I want 有可运行示例和使用文档, so that 我能在其他浏览器调用场景复用这些包。

## Implementation Decisions

### 范围与包边界

- @memora/datasets 负责 Hub inspection、下载、OPFS 安装描述、Parquet 读取、feature schema、媒体引用和异步迭代；复用 @memora/fs 的流式写入和原生 File 读取能力。
- @memora/evaluation 负责单次 Evaluation run、ModelAdapter、WER/CER、进度、结果汇总和最终 JSON 保存。依赖 datasets，通过注入调用模型。
- Web 负责页面、Worker 入口、模型选择和 Window 桥接。已有模型 runtime 保持单次推理职责。新包可独立导入，不依赖 React 或 Web 模块。
- 首版为内部 workspace 包；实现选择围绕 FLEURS 闭环，不提前抽取通用存储框架或多个适配器包。

### Hub 与 OPFS

- 首版支持公开 Hub 中声明式、可直接下载的 Parquet 数据集；必须跑通 google/fleurs 的 hi_in/test，不能将 repo ID 或语言硬编码成唯一可加载值。
- 使用 @huggingface/hub 获取仓库信息、README 配置及文件列表。branch/tag 在 inspection 时解析为 commit SHA，后续 metadata 和文件下载使用同一 SHA。
- 从 README configuration/split 声明和 Parquet metadata 获取 schema、文件映射与数量。内部 Dataset manifest 是实现描述，使用 Valibot 验证；首版不发布自有 manifest 格式协议。
- 优先使用指定 commit 的原生 Parquet。Dataset Viewer 不是必需运行时依赖，不把其无 revision 的结果冒充指定 commit 的数据。无法解析的布局报告清晰的不支持错误。
- UI 展示 configuration 总大小、split 大小与数量，以及所选内容合计；缺失数量应标记未知，大小从选中文件求和，避免下载整个仓库。
- 安装按来源、dataset、resolved revision、configuration、split 隔离，保留 Parquet 文件；同一已完成安装可直接复用。open 本地安装不要求联网；在线解析 main 可以发现新 revision，旧安装不自动删除。
- 下载使用 fetch/SDK 的流式能力连接 @memora/fs，提供字节进度与 AbortSignal。无字节级断点续传；失败后重下当前文件，完成文件可复用。
- 文件大小和可用来源校验信息用于检查下载完成，Parquet metadata 必须可读。完整安装标记在选中文件完成后提交；partial 文件不作为已安装数据暴露。无需内容寻址、跨 revision 去重或新增范围写入能力。
- 安装前检查预计大小和可用配额，处理实际写入的配额错误。持久存储请求由 Window 执行且不作为可用性的硬性前提。提供显式删除已安装 split；运行中使用的数据禁止删除。取消时清理未完成文件，下一次安装可识别和清理此前遗留 partial。

### Dataset API 与媒体

- 提供 inspectDataset、installDataset、openDataset 以及便利入口 loadDataset。inspection 不触发整套数据下载；loadDataset 执行必要安装后打开数据。
- openDataset 和 loadDataset 明确选择一个 split，返回稳定的 Dataset<T>。handle 提供 feature schema、已知长度、AsyncIterable 和 batches；batch 返回 example 数组，默认保留最后不足一批的 example。
- 首版按源文件稳定顺序读取。无需随机访问、通用 slice/view DSL、shuffle 或预处理流水线；可通过普通迭代消费所需数量。
- hyparquet 封装在内部读取模块，额外 codec 通过 hyparquet-compressors 按需加载。复用 Parquet metadata，按受控窗口读取，避免全 split materialization 和逐条重复解压同一块。
- 小批 API 不等于底层一定只读一行：大 row group、page 和内嵌音频可能导致较大物理读取，必须用真实 FLEURS 验证峰值内存。若 reader 默认整列物化，调整内部读取策略；不得通过修改公开数据集为自有格式绕过验收。
- feature schema 至少正确表达 FLEURS 的数字、文本、ClassLabel 和 Audio。基础嵌套值按 reader 能力暴露；不承诺 HF Features 全量兼容。
- example 中的音频采用惰性 Media reference；datasets 提供读取编码媒体的方法。音频解码位于评测 ASR 适配层，生成现有模型所需 PCM，不成为 dataset 自动读取的副作用。

### Worker 与模型调用

- dataset/evaluation SharedWorker 处理下载、OPFS、解析、音频处理和指标。Window 创建它和现有模型 SharedWorker，转发关联请求与结果。
- PCM ArrayBuffer 经 transfer list 从 evaluation Worker 移交 Window，再移交模型 Worker。处理 sender buffer 被 detach 后的生命周期；现有请求跟踪和模型快照不能再次读取已移交的 buffer。
- 适配首版 FLEURS WAV 所需的 Worker 可用解码路径，校验格式、采样率和通道。不得假设 Window 的 AudioContext 可在 SharedWorker 直接使用；如果需要额外 decoder 依赖，按实际格式引入最小实现。
- 每次串行评测一条音频，batch 是数据消费能力，不代表 ASR 原生批推理。请求使用 background priority，在 example 之间让现有 interactive 请求优先。
- ModelAdapter 接收输入与取消信号并返回 prediction；记录现有 runtime 能提供的 model ID、revision、adapter/runtime 版本和影响输出的参数。未知 revision 明确标记，不推断已知值。
- Worker 使用类型化状态事件驱动 UI，便利 API 可以提供进度回调。无持久任务订阅或 watch/resume 协议。取消停止后续请求；底层推理不能立即中断时忽略迟到结果，不继续累计。
- 页面关闭后的持续执行和恢复不作保证。模型 Worker 自身快照能力不构成 Evaluation run 恢复契约。

### 结果与指标

- 单次 run 保存 dataset ID、resolved revision、configuration、split、模型身份、评测参数、起止时间、状态和 example results。example 使用 split 中稳定序号并保留源 id，无需依赖跨版本 ExampleKey 系统。
- 每条结果保存 reference、prediction 或结构化错误、耗时和指标所需计数。单条模型/媒体错误记录后继续；模型不可用、存储不可用等全局故障终止并明确报告。
- 实现 WER 与 CER 的可测试纯函数，以及明确 ID/version 的 normalization profile。保存原始文本与参与计分的文本；不静默进行未记录的语言清洗。
- 默认采用 NFC、去除首尾空白和规范化空白序列，保留大小写与标点；WER 按空白分词，CER 按 Unicode code point 计数并排除规范化后的空白。该规则是首版明示的评测规则，不声称等同某官方排行榜协议。
- 汇总按总编辑距离除以总 reference 单位数计算，不平均每条比例；WER/CER 可大于 1。零分母的汇总为 null 并附原因，保留插入/删除/替换计数。失败 example 不参与准确率分母，必须同时展示总数、成功数、失败数和取消状态。
- 下载与模型初始化时间独立于每条调用耗时，调用耗时含队列等待并明确标注，不宣称纯模型执行延迟。首版不建立专门性能基准框架。
- 评测结果为一个有版本标记的 JSON 文档，完成后保存 OPFS，并可在 UI 查询已有结果和下载 JSON。主动取消时可保存当前部分结果并标记 canceled；页面强制关闭可能丢失未完成 run。没有 checkpoint、结果分段或二进制 artifact store。

### UI 与文档

- Web 提供输入 Hub ID、查看 config/split 大小、下载/取消、查看本地安装、模型选择、运行/取消、进度、结果汇总和逐条详情。页面使用现有组件与设计规范，不在库中发布 React 组件。
- 包提供英文 README，项目提供中文端到端使用指南；包含选择大小、加载、迭代、batch、FLEURS ASR、结果读取及常见错误。明确支持范围和关闭页面的行为。

## Testing Decisions

- 用户已确认真实 Chromium 配合小 fixture 的测试方向。优先通过公开 dataset API 和 evaluation client 测试完整链路，以现有可注入模型调用边界替换昂贵推理；测试外部行为，不断言私有函数、目录拼写或内部调用次数。
- 小型 HTTP fixture 提供 Hub metadata、固定 revision 和包含音频的 Parquet，测试 inspection 不下载完整数据、选择只下载目标 split、安装复用、离线打开、迭代顺序、batch 尾批和媒体惰性读取。
- Chromium 集成测试覆盖真实 OPFS、SharedWorker、Window 桥接、transfer 后 buffer 所有权、进度、取消、下载失败后从头重试、partial 不可打开，以及存储失败可见。用故障注入可靠覆盖配额错误，不占满开发者磁盘。
- evaluation 通过确定性假模型验证逐条输出、错误继续、取消、汇总、最终 JSON 保存与重新打开。复用现有模型 Worker 的消息/队列测试方式，增加 transfer 路径回归，确认既有模型请求不受影响。
- 纯单元测试覆盖 metadata/schema 验证、WER/CER、Unicode、零 reference、失败计数和 normalization profile；使用手工可核对的输入输出。
- 完整 FLEURS hi_in/test 是手动或慢速真实验收：显示约 306 MB/418 条（具体以固定 revision 为准），下载到 OPFS，实际端侧 ASR 跑完整 split，保存可解析结果，数量与 schema 一致。记录 revision、模型和峰值内存观察，验证页面可继续操作。
- 常规 CI 使用小 fixture，不下载整套 FLEURS 或模型。执行修改包及相关 Web 的类型、lint、build 和必要测试；验证新包独立导入且无 Web 反向依赖。
- 文档示例使用同一公开接口验证。首次可运行链路验收后，根据证据调整 reader 内部窗口等实现参数，无需再展开产品访谈。

## Out of Scope

- 自有公开数据格式、dataset authoring skill、发布工具或转换 CLI。
- 私有/gated Hub 鉴权、任意 Python builder、CSV/JSONL 等原始格式的全面导入，以及 HF 全库兼容。
- 远程边读边用、字节级断点续传、下载哈希状态恢复、内容寻址去重、复杂垃圾回收。
- Evaluation checkpoint、页面关闭后恢复、持久任务调度、SharedWorker 之间直接 MessagePort 拓扑重构。
- 通用 Dataset view 查询、SQL、确定性 shuffle、任意可恢复预处理和跨 revision 样本复用。
- 分段结果存储、IndexedDB/SQLite、结果 bundle 导入导出、artifact store 和跨运行分析平台。
- 首版以外的 embedding/OCR/文本生成评测、全面媒体 codec 支持、完整移动端与多浏览器兼容、npm 对外发布。

## Further Notes

- 本规格以访谈末尾明确简化后的范围为准，覆盖此前更宽泛的选择。现有两条架构决定保持有效：dataset/evaluation 独立于 Web；OPFS 保留 Parquet 和内部安装描述。
- 字节级续传与评测恢复是用户明确延后项。内部 manifest 仅用于可靠加载，不重新引入私有发布格式。
- 既有代码提供 OPFS writeStream、模型 SharedWorker、ASR PCM 请求、background priority 和零散 benchmark，可复用其边界；现有模型任务快照不作为本规格的恢复实现。
- FLEURS 参考 revision 为 70bb2e84b976b7e960aa89f1c648e09c59f894dd，hi_in/test 文件为 305,903,369 字节。该值用于验收参照，生产代码读取实际 metadata，不硬编码。
- 官方参考：[FLEURS 固定 revision](https://huggingface.co/datasets/google/fleurs/tree/70bb2e84b976b7e960aa89f1c648e09c59f894dd/parquet-data/hi_in)、[Hugging Face Datasets](https://github.com/huggingface/datasets)、[hyparquet](https://github.com/hyparam/hyparquet)。
