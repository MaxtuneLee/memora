// Kept apart from helpers.ts, which pulls in chat tools and the model worker, so ChatMessage
// stays light enough to render on its own.

// The empty-state mascot and the first assistant avatar share this id so motion flies one into the other.
export const CHAT_MASCOT_LAYOUT_ID = "chat-mascot";
// Shared by the mascot flight and the composer's move from the center to the bottom.
export const CHAT_LAYOUT_TRANSITION = { duration: 0.45, ease: [0.22, 1, 0.36, 1] } as const;
