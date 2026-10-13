# Release notes

Add a `## ` section at the top for each release that changes what people see or can do. Each
`- ` line is shown in the update dialog, so write it for the people using Memora. The heading is
the release id (use the release date, and add `.2` for a second release on the same day).

## 2026-10-14.3

- Exports now include your desktop widgets, and importing keeps all your settings, including assistant instructions and saved permissions. Thumbnails of imported files are kept too.
- Import checks the whole archive before changing anything, so a damaged file no longer wipes your current data. It also opens archives you unpacked and zipped again.
- File names with non-Latin characters show correctly when you open an export in other ZIP tools, and very large libraries can be exported.

## 2026-10-14.2

- Citations in chat now open when you hover over the number, so you can see which recording moments they point to without clicking.

## 2026-10-14

- Turn on learning mode with the graduation cap button under the chat box. Memora then explains a concept, builds a hands-on lesson you work through step by step, and ends it with questions you answer by using the lesson itself. Your result goes back to Memora, which goes over what you missed. A large topic is taught in parts and ends with a final review across all of them.
- Learning mode looks up your library before explaining, sizes each part by the concept rather than by the document's sections, and no longer gives away the right answer by making it the longest option.
- You can now choose whether chat asks before reading your files, not just before changing them, in Settings > Permissions. Each chat can change this from the menu under the chat box.
- When chat asks, you can allow once, or always allow that file, its folder, or your whole library. Saved permissions are listed in Settings > Permissions, where you can also add or remove them.
- The permission dialog says in plain words what the assistant wants to do, which files or folders it covers, and how large a change is.
- Turn on Auto review to let a model approve routine requests for you. It asks you when it is unsure, and you can pick its model under Models by feature > Permission review.
- Referencing files no longer blocks chat from everything else: reading other files asks you instead.
- In browsers with WebMCP, the browser's own assistant can search and read your library through Memora. It asks in the Memora tab first, following your permission settings, and cannot change anything.
- Charts, diagrams, and lessons in a chat reply now appear at the point in the answer where they belong, instead of above all the text. They also shrink to fit what they show, and interactive ones no longer show repeated content after they finish loading.
- Text the assistant writes before using a tool no longer disappears when the reply finishes, and text after a tool starts a new paragraph instead of running into the previous sentence.
- When a Gemini model stops without answering after using a tool, Memora asks it again automatically.
- Chat replies show inline formulas written as `$x$`.
- Tables in chat look tidier: copy, download, and full screen sit in one row above the table, and opening or closing full screen now animates smoothly.
- Code blocks in chat show one line per row again, with the copy button back in the top right corner.
- The New session button under the chat box is gone; start a new chat from the chat history.
- Providers can now use the Anthropic messages API or the Gemini API. Choose "Anthropic messages" or "Gemini" as the API format when adding a provider.
- Reviewing changes from the note chat keeps the rest of the note formatted in Preview. Only the changed parts show as Markdown with accept and reject buttons, and Code keeps your scroll position.
- Searching your library also finds other forms of an English word, such as "running" for "run", and search results break at the end of a sentence.
- Transcription no longer stays stuck after you close or reload a tab that was recording.

## 2026-09-29

- The end of a note shows its word count (character count for Chinese, Japanese, or Korean text), when it was created, and when it was last edited.
- The note chat panel slides open and closed, and the note narrows alongside it. The Actions menu is gone from the note header.
- The outline beside a note takes less room, and its titles open over the note on hover.
- More notes open in Preview: blank lines the editor adds or removes between blocks no longer block it, bold text next to full-width punctuation such as （） and ；, and formulas inside bold or italic text, are kept as written.
- Parts of a note that Preview cannot show as written stay as editable Markdown in Preview instead of sending the whole note to Code. Fix one and it shows formatted once you click away.
- The note chat knows which lines Preview cannot show and can explain or fix them.
- The greeting in a new chat puts the question on its own line.

## 2026-09-28.2

- The note editor no longer jumps the cursor into a code block when a note contains a divider, and typing inside bold or italic text keeps the formatting.
- Tables: the first column is no longer shown as a header, bold, links and code in cells are kept, and a new options button on the selected cell lets you insert or delete rows and columns, set column alignment, or delete the table. Press Tab in the last cell to add a row, or type a header row and a `| --- |` row and press Enter to create a table.
- Tab and Shift+Tab indent and outdent list items, Backspace at the start of a list item, heading, or quote turns it back into plain text, and typing `[ ] ` in a list item makes it a task.
- Pasting Markdown text shows it formatted instead of as raw symbols.
- More notes open in Preview: lists indented with 2 spaces, aligned or padded tables, `***` dividers, underlined headings, and front matter are kept as written. Tasks marked `[X]` stay checked.
- The note editor has a Chat button that opens a chat panel on the right. It is a normal chat, so it appears in Chat history. Selected text in the note is attached to your next message. Changes the chat suggests are marked in the note, with removed text struck through and new text highlighted, and you accept or reject each one.

## 2026-09-28

- Sources in the assistant's answers now appear as small numbered marks after the text they support. Click one to see the recordings and times it cites, and click a time to jump there.
- Documents the assistant creates or edits appear as cards below its reply; click one to open it.

## 2026-09-27

- When you ask about something you saved, such as a lecture or recording, the assistant looks it up in your library before answering and links to the moments it used.
- The assistant can now change specific parts of a text file instead of rewriting the whole file, and the approval dialog shows exactly what will be removed and added.
- Documents the assistant creates for you now appear in your library like any other note.

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
