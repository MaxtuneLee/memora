# Release notes

Add a `## ` section at the top for each release that changes what people see or can do. Each
`- ` line is shown in the update dialog, so write it for the people using Memora. The heading is
the release id (use the release date, and add `.2` for a second release on the same day).

## 2026-09-26.2

- When you edit and resend an earlier message, the assistant still remembers the tool results and images from before it.
- In long chats, older replies and tool results are shortened instead of dropped, and the assistant can look up the full text when it needs it.
- A deleted chat no longer reappears in the chat history.
- When a chat outgrows the model, earlier turns are summarized instead of dropped. Choose the model for this under Settings > Models by feature > Long conversations.
- After you step away from a chat for a few minutes, a short recap of where you left off appears below the last message.
- When you steer a running reply, the reply ends where the assistant reads your message and continues in a new reply below it. Queued messages are listed above the message box, and each can be steered into the running reply. Whether new messages wait or steer is now set only in Settings.

## 2026-09-26

- While a reply is being written, you can scroll up to read earlier messages without being pulled back down, and the chat now scrolls smoothly.
- Long chats that used tools no longer fail with an "invalid function_call_output" error.
- Newly added models whose context size isn't known now assume 128K instead of 32K.
- Settings > About has a Check for updates button.

## 2026-09-25.2

- Widgets in chat display again instead of showing an error.
- The retry button in chat no longer makes the conversation scroll sideways.
- The last message in a chat has more room above the message box.
- Sidebar section labels are easier to read.

## 2026-09-25

- Chat history shows which conversations are still running and which have unread replies.
- A notification tells you when a reply is ready in another conversation.
- New chats start with the message box centered under the greeting.
- Memora now asks before updating, and shows what changed in the new version.
- Settings > About shows the exact build you are running.
