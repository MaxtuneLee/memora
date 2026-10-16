import { TrashIcon } from "@phosphor-icons/react";
import { useState } from "react";
import * as stylex from "@stylexjs/stylex";

import {
  SETTINGS_FIELD_LABEL_CLASS_NAME,
  SETTINGS_INSET_PANEL_CLASS_NAME,
  SETTINGS_PANEL_CLASS_NAME,
  SETTINGS_ROW_CLASS_NAME,
  SETTINGS_SECTION_BODY_CLASS_NAME,
  SETTINGS_SECTION_TITLE_CLASS_NAME,
} from "@/components/settings/settingsClassNames";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Switch } from "@/components/ui/Switch";
import {
  chatPathLabel,
  DEFAULT_PERMISSION_MODE,
  type PermissionGrant,
  type PermissionGrantTarget,
} from "@/lib/chat/permissions";
import { desktopFilesQuery$, desktopFoldersQuery$ } from "@/lib/desktop/queries";
import { settingsDocumentQuery$ } from "@/lib/settings/queries";
import { normalizeSettingsValue, settingEvents } from "@/livestore/setting";
import { useAppStore } from "@/livestore/store";
import { tokens } from "../../styles/stylex.stylex";

const styles = stylex.create({
  stack: { display: "flex", flexDirection: "column", gap: 16 },
  heading: { display: "flex", flexDirection: "column", gap: 8 },
  twoColumn: {
    display: "grid",
    gap: 16,
    marginTop: 20,
    "@media (min-width: 640px)": { gridTemplateColumns: "repeat(2, minmax(0, 1fr))" },
  },
  addRow: {
    alignItems: "end",
    display: "grid",
    gap: 12,
    marginTop: 20,
    "@media (min-width: 640px)": { gridTemplateColumns: "1fr 1fr 2fr auto" },
  },
  inputMargin: { marginTop: 8 },
  grants: { display: "flex", flexDirection: "column", gap: 12, marginTop: 20 },
  grant: { alignItems: "center", display: "flex", gap: 12 },
  grantBody: { alignItems: "center", display: "flex", flex: 1, gap: 8, minWidth: 0 },
  grantText: {
    color: tokens.text,
    fontSize: 14,
    margin: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  icon: { height: 16, width: 16 },
  insetMargin: { marginTop: 20 },
  switchRow: { alignItems: "center", display: "flex", gap: 16, justifyContent: "space-between" },
});

type TargetKind = "file" | "folder" | "library";

export default function SettingsPermissionsSection() {
  const store = useAppStore();
  const settings = normalizeSettingsValue(store.useQuery(settingsDocumentQuery$));
  const files = store.useQuery(desktopFilesQuery$) as ReadonlyArray<{ id: string; name: string }>;
  const folders = store.useQuery(desktopFoldersQuery$) as ReadonlyArray<{
    id: string;
    name: string;
  }>;
  const mode = settings.permissionMode ?? DEFAULT_PERMISSION_MODE;
  const grants = settings.permissionGrants ?? [];
  const [access, setAccess] = useState<"read" | "write">("read");
  const [kind, setKind] = useState<TargetKind>("folder");
  const [targetId, setTargetId] = useState<string | null>(null);

  const setGrants = (next: readonly PermissionGrant[]) =>
    store.commit(settingEvents.settingsSet({ permissionGrants: next }));

  const describe = (target: PermissionGrantTarget): { label: string; missing: boolean } => {
    if (target.kind === "library") return { label: "Whole library", missing: false };
    if (target.kind === "path-prefix")
      return {
        label: chatPathLabel(target.prefix)
          ? `Chat working files in "${chatPathLabel(target.prefix)}"`
          : "All chat working files",
        missing: false,
      };
    if (target.kind === "file") {
      const name = files.find((file) => file.id === target.fileId)?.name;
      return { label: name ? `File: ${name}` : "File", missing: !name };
    }
    const name = folders.find((folder) => folder.id === target.folderId)?.name;
    return { label: name ? `Folder: ${name} and its subfolders` : "Folder", missing: !name };
  };

  const targetOptions = (kind === "file" ? files : kind === "folder" ? folders : []).map(
    (item) => ({ value: item.id, label: item.name }),
  );
  const canAdd = kind === "library" || Boolean(targetId);
  const addGrant = () => {
    const target: PermissionGrantTarget | null =
      kind === "library"
        ? { kind: "library" }
        : targetId
          ? kind === "file"
            ? { kind: "file", fileId: targetId }
            : { kind: "folder", folderId: targetId }
          : null;
    if (!target) return;
    setGrants([...grants, { id: crypto.randomUUID(), access, target, createdAt: Date.now() }]);
    setTargetId(null);
  };

  return (
    <div {...stylex.props(styles.stack)}>
      <section className={SETTINGS_PANEL_CLASS_NAME}>
        <div {...stylex.props(styles.heading)}>
          <h3 className={SETTINGS_SECTION_TITLE_CLASS_NAME}>WebMCP</h3>
          <p className={SETTINGS_SECTION_BODY_CLASS_NAME}>
            Let external assistants use Memora through WebMCP. These controls apply to this device
            only.
          </p>
        </div>
        <div {...stylex.props(styles.grants)}>
          {(
            [
              ["webMcpEnabled", "Enable WebMCP", "Expose tools while Memora is open."],
              [
                "webMcpReadEnabled",
                "Allow reading",
                "Search and read library files, transcripts, and chat history. File permissions still apply.",
              ],
              [
                "webMcpWriteEnabled",
                "Allow changes",
                "Create and edit documents, and open pages. File changes still need approval or a saved permission.",
              ],
            ] as const
          ).map(([key, label, description]) => (
            <div
              key={key}
              className={`${SETTINGS_ROW_CLASS_NAME} ${stylex.props(styles.switchRow).className}`}
            >
              <div {...stylex.props(styles.heading)}>
                <label htmlFor={key} className={SETTINGS_FIELD_LABEL_CLASS_NAME}>
                  {label}
                </label>
                <p id={`${key}-description`} className={SETTINGS_SECTION_BODY_CLASS_NAME}>
                  {description}
                </p>
              </div>
              <Switch
                id={key}
                aria-label={label}
                checked={settings[key] === true}
                disabled={key !== "webMcpEnabled" && settings.webMcpEnabled !== true}
                aria-describedby={`${key}-description`}
                onCheckedChange={(checked) =>
                  store.commit(settingEvents.deviceSettingsSet({ [key]: checked }))
                }
              />
            </div>
          ))}
        </div>
      </section>

      <section className={SETTINGS_PANEL_CLASS_NAME}>
        <div {...stylex.props(styles.heading)}>
          <h3 className={SETTINGS_SECTION_TITLE_CLASS_NAME}>Default for new chats</h3>
          <p className={SETTINGS_SECTION_BODY_CLASS_NAME}>
            Files you reference in a chat can always be read. Each chat can change this from its
            input area.
          </p>
        </div>
        <div {...stylex.props(styles.twoColumn)}>
          <div>
            <label htmlFor="permission-guard" className={SETTINGS_FIELD_LABEL_CLASS_NAME}>
              Ask before
            </label>
            <Select
              id="permission-guard"
              value={mode.guard}
              onValueChange={(value) =>
                store.commit(
                  settingEvents.settingsSet({
                    permissionMode: {
                      ...mode,
                      guard: value === "reads-and-writes" ? "reads-and-writes" : "writes",
                    },
                  }),
                )
              }
              triggerClassName={stylex.props(styles.inputMargin).className}
              options={[
                { value: "writes", label: "Changes to files" },
                { value: "reads-and-writes", label: "Reading and changing files" },
              ]}
            />
          </div>
          <div>
            <label htmlFor="permission-approver" className={SETTINGS_FIELD_LABEL_CLASS_NAME}>
              Approved by
            </label>
            <Select
              id="permission-approver"
              value={mode.approver}
              onValueChange={(value) =>
                store.commit(
                  settingEvents.settingsSet({
                    permissionMode: { ...mode, approver: value === "auto" ? "auto" : "user" },
                  }),
                )
              }
              triggerClassName={stylex.props(styles.inputMargin).className}
              options={[
                { value: "user", label: "Me" },
                { value: "auto", label: "Auto review" },
              ]}
            />
          </div>
        </div>
        <p
          className={`${SETTINGS_SECTION_BODY_CLASS_NAME} ${stylex.props(styles.insetMargin).className}`}
        >
          Auto review uses the Permission review model from Models by feature. It sees what you
          asked and which files a request names, never their content, and asks you when it is
          unsure.
        </p>
      </section>

      <section className={SETTINGS_PANEL_CLASS_NAME}>
        <div {...stylex.props(styles.heading)}>
          <h3 className={SETTINGS_SECTION_TITLE_CLASS_NAME}>Saved permissions</h3>
          <p className={SETTINGS_SECTION_BODY_CLASS_NAME}>
            Chat can use these without asking. Read and change permissions are separate.
          </p>
        </div>

        <div {...stylex.props(styles.addRow)}>
          <div>
            <label htmlFor="grant-access" className={SETTINGS_FIELD_LABEL_CLASS_NAME}>
              Allow
            </label>
            <Select
              id="grant-access"
              value={access}
              onValueChange={(value) => setAccess(value === "write" ? "write" : "read")}
              triggerClassName={stylex.props(styles.inputMargin).className}
              options={[
                { value: "read", label: "Reading" },
                { value: "write", label: "Changes" },
              ]}
            />
          </div>
          <div>
            <label htmlFor="grant-kind" className={SETTINGS_FIELD_LABEL_CLASS_NAME}>
              For
            </label>
            <Select
              id="grant-kind"
              value={kind}
              onValueChange={(value) => {
                setKind(value === "file" ? "file" : value === "library" ? "library" : "folder");
                setTargetId(null);
              }}
              triggerClassName={stylex.props(styles.inputMargin).className}
              options={[
                { value: "folder", label: "A folder" },
                { value: "file", label: "A file" },
                { value: "library", label: "Whole library" },
              ]}
            />
          </div>
          <div>
            {kind !== "library" && (
              <Select
                aria-label={kind === "file" ? "File" : "Folder"}
                value={targetId}
                onValueChange={setTargetId}
                placeholder={kind === "file" ? "Choose a file" : "Choose a folder"}
                options={targetOptions}
              />
            )}
          </div>
          <Button variant="secondary" onClick={addGrant} disabled={!canAdd}>
            Add
          </Button>
        </div>

        {grants.length > 0 ? (
          <div {...stylex.props(styles.grants)}>
            {grants.map((grant) => {
              const { label, missing } = describe(grant.target);
              return (
                <div
                  key={grant.id}
                  className={`${SETTINGS_ROW_CLASS_NAME} ${stylex.props(styles.grant).className}`}
                >
                  <div {...stylex.props(styles.grantBody)}>
                    <Badge>{grant.access === "read" ? "Read" : "Change"}</Badge>
                    <p {...stylex.props(styles.grantText)}>{label}</p>
                    {missing && <Badge variant="warning">Missing</Badge>}
                  </div>
                  <Button
                    variant="destructiveIcon"
                    type="button"
                    onClick={() => setGrants(grants.filter((item) => item.id !== grant.id))}
                    aria-label={`Remove ${label}`}
                  >
                    <TrashIcon className={stylex.props(styles.icon).className} />
                  </Button>
                </div>
              );
            })}
          </div>
        ) : (
          <div
            className={`${SETTINGS_INSET_PANEL_CLASS_NAME} ${stylex.props(styles.insetMargin).className}`}
          >
            <p className={SETTINGS_SECTION_BODY_CLASS_NAME}>No saved permissions.</p>
          </div>
        )}
      </section>
    </div>
  );
}
