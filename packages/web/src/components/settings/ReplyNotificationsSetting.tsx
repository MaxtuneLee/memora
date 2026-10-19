import { useState } from "react";
import * as stylex from "@stylexjs/stylex";

import {
  SETTINGS_INSET_PANEL_CLASS_NAME,
  SETTINGS_SECTION_BODY_CLASS_NAME,
  SETTINGS_SECTION_TITLE_CLASS_NAME,
} from "@/components/settings/settingsClassNames";
import { Button } from "@/components/ui/Button";
import {
  enableReplyNotifications,
  getReplyNotificationPermission,
  readReplyNotificationsEnabled,
  writeReplyNotificationsEnabled,
} from "@/lib/app/replyNotifications";
import { tokens } from "../../styles/stylex.stylex";

const styles = stylex.create({
  buttonRow: { display: "flex", marginTop: 8 },
  softHelp: {
    color: tokens.textSoft,
    fontSize: 12,
    lineHeight: "20px",
    marginTop: 8,
  },
});

export default function ReplyNotificationsSetting() {
  const [preferred, setPreferred] = useState(readReplyNotificationsEnabled);
  const [permission, setPermission] = useState(getReplyNotificationPermission);
  const enabled = preferred && permission === "granted";
  const unavailable = permission === "unsupported" || permission === "denied";

  const handleToggle = async (): Promise<void> => {
    if (enabled) {
      writeReplyNotificationsEnabled(false);
      setPreferred(false);
      return;
    }
    setPreferred(await enableReplyNotifications());
    setPermission(getReplyNotificationPermission());
  };

  return (
    <div className={SETTINGS_INSET_PANEL_CLASS_NAME}>
      <h4 className={SETTINGS_SECTION_TITLE_CLASS_NAME}>Reply notifications</h4>
      <p className={SETTINGS_SECTION_BODY_CLASS_NAME}>
        Show a system notification when a reply finishes while Memora is not in the foreground.
      </p>
      <div {...stylex.props(styles.buttonRow)}>
        <Button
          variant="segment"
          active={enabled}
          type="button"
          aria-pressed={enabled}
          disabled={!enabled && unavailable}
          onClick={() => void handleToggle()}
        >
          {enabled ? "On" : "Off"}
        </Button>
      </div>
      {permission === "unsupported" ? (
        <p {...stylex.props(styles.softHelp)}>This browser does not support notifications.</p>
      ) : null}
      {permission === "denied" ? (
        <p {...stylex.props(styles.softHelp)}>
          Notifications are blocked. Allow them in your browser's site settings to turn this on.
        </p>
      ) : null}
    </div>
  );
}
