# 转写 provider 接口

业务层传入单声道 Float32 PCM，只依赖 `TranscriptionProvider` 和 `TranscriptionSession`。服务商鉴权、网络协议和本地模型执行由适配器负责；凭据不属于 options、转写事件或录音存储格式。

当前范围：纯客户端，本地 Whisper 与云端 ElevenLabs Scribe。Qwen Realtime 暂不接入，已移除协议分支。不得为转写增加 Memora 后端、凭据代理或音频中转；技术限制在开发沟通中说明，不新增页面说明。

## 会话约定

- `getCapabilities(modelId)`：按模型声明采样率、分段方式、时间戳和部分结果能力。请求不支持的能力时，在连接前报错。
- `open(options, onEvent)`：会话就绪后返回。云端就绪包括协议确认；本地模型按首批音频按需加载，下载进度通过事件报告。
- `write(samples)`：按顺序写入音频，调用方必须等待返回的 Promise。输入在调用时复制，调用方可复用原缓冲区。
- `commit()`：手动结束一句，不关闭会话；只有手动分段模式提供此方法。
- `finish()`：处理所有已接受音频和尾段，等待最后结果及所请求的时间戳，再关闭；可重复调用。
- `abort()`：丢弃未完成结果，关闭连接或取消本地请求；取消后不再发出文本事件。
- `segment` 通过 `id` 和递增 `revision` 更新；部分结果是该段的完整替换文本。最终结果仍可有后续时间戳补充，消费方应等待 `finish()` 完成再保存。

## 当前适配器

| 适配器 | 模型 | 分段 | 时间戳 | 连接 |
| --- | --- | --- | --- | --- |
| `whisper-local` | `whisper-base-timestamped` | 手动，内部最多 30 秒一块 | 段、词 | 现有本地模型运行时 |
| `elevenlabs-scribe` | `scribe_v2_realtime` | 手动 | 词 | 宿主注入连接，或用 `createScribeConnection` 注入临时 token 获取函数 |

Scribe 等待已提交段和延迟到达的词级时间戳。缺失结果、意外断线和结束超时都会报错，不把不完整结果当作成功。

`transcribePcm` 是已解码文件的消费入口，每 20 秒提交一段。云端适配器按音频时长控制发送速度，不应把长文件转写视为快速批处理 API。`toRecordingTranscript` 转为现有存储结构，无有效时间戳的文本保留在 `text` 中，不伪造 `words` 的时间点。

## 接入新的服务商

1. 实现 `TranscriptionProvider`，在会话内部转换音频格式及服务商消息。
2. 注入鉴权连接，不在协议事件、错误文案、同步事件或持久化转写参数中携带凭据。
3. 注册到 `TranscriptionProviderRegistry`；未注册或配置无效时必须报错，不自动改用其他服务商。
4. 补充能力校验、部分结果替换、尾段、取消、异常断线及时间戳测试。
5. 将已配置的 provider/model 传给业务入口，并在开始一次任务时固定选择。

## 接入边界与待办

`lib/models/transcriptionRuntime.ts` 统一解析功能级选择；未设置时默认本地 Whisper，显式云端选择必须有宿主提供的账号到适配器解析器，不能静默使用本地模型。解析器按模型能力选择时间戳模式，不根据聊天 API 格式猜测 ASR 协议，也不在解析阶段打开网络连接。

文件 hook 在点击开始时读取功能配置，并固定一次任务的选择；也允许调用方注入已解析执行配置。录音保留现有 VAD、队列和兼容消息格式，其本地执行已调用新适配器，并在模型准备和申请麦克风前校验功能选择。云端连接未配置时，录音页显示错误和重试入口，不展示“准备本地模型”的错误状态。

录音的持续云端会话、设置/onboarding 选择和端到端验证尚未接通。新的注册表暂未连接到设置中的 provider 元数据。

Scribe 后续采用用户自带 key 的纯客户端路径：浏览器直接向 ElevenLabs 官方接口换取单次 token，再用 token 直连其 WebSocket。已有连接工厂支持注入 token 获取函数，但官方 token 获取与设备凭据读取尚未接通。2026-08-28 的无凭据 OPTIONS 检查返回允许跨域；这仅证明当时的预检响应，真实 key、实际 POST 响应和完整转写仍需验证。短音频、静音、长时间运行及录音暂停恢复也需验收；模拟协议测试不代表生产连接已验证。

图片、公式、嵌入不属于本阶段。

## 协议依据

- [ElevenLabs 单次 token 接口](https://elevenlabs.io/docs/api-reference/tokens/create)
- [ElevenLabs Scribe JavaScript](https://elevenlabs.io/docs/eleven-api/resources/libraries/scribe-stt/javascript-scribe)
- [Scribe WebSocket API](https://elevenlabs.io/docs/api-reference/speech-to-text/v-1-speech-to-text-realtime)
- [Scribe 浏览器连接](https://elevenlabs.io/docs/eleven-api/guides/how-to/speech-to-text/realtime/client-side-streaming)
