import * as stylex from "@stylexjs/stylex";
import { Effect, Fiber, Stream } from "@livestore/utils/effect";
import { useEffect, useState, type FormEvent } from "react";

import {
  SETTINGS_FIELD_LABEL_CLASS_NAME,
  SETTINGS_PANEL_CLASS_NAME,
  SETTINGS_ROW_CLASS_NAME,
  SETTINGS_SECTION_BODY_CLASS_NAME,
  SETTINGS_SECTION_TITLE_CLASS_NAME,
} from "@/components/settings/settingsClassNames";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useRemoteFileCount, useSyncServerState } from "@/lib/sync/blobSync";
import { readWebdavSyncPayload, saveWebdavSyncPayload, useAppStore } from "@/livestore/store";
import {
  checkWebdavServer,
  parseWebdavSyncPayload,
  type ServerCheck,
  type WebdavSyncPayload,
} from "@/livestore/webdavSync";
import { tokens } from "../../styles/stylex.stylex";

const styles = stylex.create({
  section: { display: "flex", flexDirection: "column", gap: 20 },
  heading: { display: "flex", flexDirection: "column", gap: 8 },
  fields: { display: "grid", gap: 16 },
  label: { display: "block", marginBottom: 8 },
  actions: { display: "flex", flexWrap: "wrap", gap: 8 },
  message: { fontSize: 14, lineHeight: "22px", margin: 0 },
  success: { color: tokens.successText },
  error: { color: tokens.dangerText },
  rows: { display: "flex", flexDirection: "column", gap: 12 },
  row: { alignItems: "center", display: "flex", gap: 16, justifyContent: "space-between" },
  value: { color: tokens.text, fontSize: 14, textAlign: "end" },
});

type Busy = "checking" | "saving" | null;

/** Whether this device's LiveStore can reach the sync server right now. */
const useServerConnected = (): boolean | undefined => {
  const store = useAppStore();
  const [connected, setConnected] = useState<boolean>();
  useEffect(() => {
    const fiber = Effect.runFork(
      store.networkStatus.changes.pipe(
        Stream.runForEach((status) => Effect.sync(() => setConnected(status.isConnected))),
      ),
    );
    return () => void Effect.runFork(Fiber.interrupt(fiber));
  }, [store]);
  return connected;
};

export default function SettingsSyncSection() {
  const saved = readWebdavSyncPayload();
  const [url, setUrl] = useState(saved?.url ?? "");
  const [username, setUsername] = useState(saved?.username ?? "");
  const [password, setPassword] = useState(saved?.password ?? "");
  const [busy, setBusy] = useState<Busy>(null);
  const [check, setCheck] = useState<ServerCheck>();
  const connected = useServerConnected();
  const remoteFiles = useRemoteFileCount();
  const serverState = useSyncServerState();

  const form = parseWebdavSyncPayload({
    url: url.trim(),
    ...(username && { username }),
    ...(password && { password }),
  });
  const changed =
    saved?.url !== form?.url ||
    (saved?.username ?? "") !== username ||
    (saved?.password ?? "") !== password;

  const runCheck = async (config: WebdavSyncPayload): Promise<boolean> => {
    setBusy("checking");
    setCheck(undefined);
    const result = await checkWebdavServer(config);
    setCheck(result);
    setBusy(null);
    return result.ok;
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!form || !(await runCheck(form))) return;
    setBusy("saving");
    saveWebdavSyncPayload({ ...saved, ...form });
  };

  const handleTurnOff = (): void => {
    setBusy("saving");
    saveWebdavSyncPayload(undefined);
  };

  return (
    <section className={`${SETTINGS_PANEL_CLASS_NAME} ${stylex.props(styles.section).className}`}>
      <div {...stylex.props(styles.heading)}>
        <h3 className={SETTINGS_SECTION_TITLE_CLASS_NAME}>Server</h3>
        <p className={SETTINGS_SECTION_BODY_CLASS_NAME}>
          We use worker to sync your data to object storage provider, you can deploy your own sync
          worker with Cloudflare Worker. API keys only sync when they're encrypted with a passkey.
        </p>
      </div>

      <form {...stylex.props(styles.section)} onSubmit={(event) => void handleSubmit(event)}>
        <div {...stylex.props(styles.fields)}>
          <div>
            <label
              htmlFor="sync-url"
              className={`${SETTINGS_FIELD_LABEL_CLASS_NAME} ${stylex.props(styles.label).className}`}
            >
              Server address
            </label>
            <Input
              id="sync-url"
              type="url"
              required
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://memora-webdav.example.workers.dev"
              autoComplete="url"
              spellCheck={false}
              aria-invalid={url.trim() !== "" && !form}
            />
          </div>
          <div>
            <label
              htmlFor="sync-username"
              className={`${SETTINGS_FIELD_LABEL_CLASS_NAME} ${stylex.props(styles.label).className}`}
            >
              Username
            </label>
            <Input
              id="sync-username"
              type="text"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              spellCheck={false}
            />
          </div>
          <div>
            <label
              htmlFor="sync-password"
              className={`${SETTINGS_FIELD_LABEL_CLASS_NAME} ${stylex.props(styles.label).className}`}
            >
              Password
            </label>
            <Input
              id="sync-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
            />
          </div>
        </div>

        {check && (
          <p
            role={check.ok ? "status" : "alert"}
            {...stylex.props(styles.message, check.ok ? styles.success : styles.error)}
          >
            {check.ok ? "The server is ready for sync." : check.message}
          </p>
        )}

        <div {...stylex.props(styles.actions)}>
          {(!saved || changed) && (
            <Button type="submit" variant="primary" disabled={!form || busy !== null}>
              {busy === "saving" ? "Restarting…" : saved ? "Save changes" : "Turn on sync"}
            </Button>
          )}
          <Button
            type="button"
            disabled={!form || busy !== null}
            onClick={() => form && void runCheck(form)}
          >
            {busy === "checking" ? "Testing…" : "Test connection"}
          </Button>
          {saved && (
            <Button type="button" disabled={busy !== null} onClick={handleTurnOff}>
              Turn off sync
            </Button>
          )}
        </div>
        <p className={SETTINGS_SECTION_BODY_CLASS_NAME}>
          Turning sync on, off, or changing the server reloads Memora in every open tab.
        </p>
      </form>

      {saved && (
        <div {...stylex.props(styles.rows)}>
          <div className={`${SETTINGS_ROW_CLASS_NAME} ${stylex.props(styles.row).className}`}>
            <span className={SETTINGS_FIELD_LABEL_CLASS_NAME}>Connection</span>
            <span {...stylex.props(styles.value)}>
              {serverState === "changed"
                ? "Paused. This server isn't the one this device synced with before, so nothing is sent or received."
                : connected === undefined
                  ? "Checking…"
                  : connected
                    ? "Connected"
                    : "Offline. Changes stay on this device until the server is back."}
            </span>
          </div>
          <div className={`${SETTINGS_ROW_CLASS_NAME} ${stylex.props(styles.row).className}`}>
            <span className={SETTINGS_FIELD_LABEL_CLASS_NAME}>Files on other devices</span>
            <span {...stylex.props(styles.value)}>
              {remoteFiles === 0
                ? "All files are on this device"
                : `${remoteFiles} ${remoteFiles === 1 ? "file downloads" : "files download"} when opened`}
            </span>
          </div>
        </div>
      )}
    </section>
  );
}
