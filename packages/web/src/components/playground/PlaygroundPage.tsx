import { Tabs } from "@base-ui/react/tabs";
import {
  BrainIcon,
  DatabaseIcon,
  FileSearchIcon,
  FlaskIcon,
  HardDrivesIcon,
  MicrophoneStageIcon,
  ScanIcon,
  SmileyIcon,
} from "@phosphor-icons/react";
import * as stylex from "@stylexjs/stylex";

import DocumentParsing from "./DocumentParsing";
import OcrBenchmark from "./OcrBenchmark";
import ImageDocumentPipeline from "./ImageDocumentPipeline";
import GroundedRetrieval from "./GroundedRetrieval";
import VectorDbInspector from "./VectorDbInspector";
import DatasetInstaller from "./DatasetInstaller";
import AsrEvaluation from "./AsrEvaluation";
import MascotShowcase from "./MascotShowcase";
import { tokens } from "../../styles/stylex.stylex";

const styles = stylex.create({
  page: {
    backgroundColor: tokens.canvas,
    minHeight: "100%",
    paddingBlock: { default: "1.75rem", "@media (min-width: 640px)": "2.25rem" },
    paddingInline: {
      default: "1.25rem",
      "@media (min-width: 640px)": "2rem",
      "@media (min-width: 1024px)": "2.5rem",
    },
  },
  content: { marginInline: "auto", maxWidth: "1480px", width: "100%" },
  header: { alignItems: "center", display: "flex", gap: "0.75rem", paddingBottom: "1.75rem" },
  headerIcon: { color: tokens.olive, height: "1.25rem", width: "1.25rem" },
  title: {
    color: tokens.textStrong,
    fontFamily: '"IBM Plex Serif", serif',
    fontSize: { default: "1.5rem", "@media (min-width: 640px)": "1.875rem" },
    fontWeight: 500,
    letterSpacing: "-0.025em",
    lineHeight: { default: "2rem", "@media (min-width: 640px)": "2.25rem" },
  },
  tabs: { marginTop: "1.75rem" },
  tabList: {
    backgroundColor: tokens.surfaceMuted,
    borderRadius: "1rem",
    display: "flex",
    gap: "0.25rem",
    overflowX: "auto",
    padding: "0.375rem",
    position: "relative",
    width: { default: "100%", "@media (min-width: 640px)": "fit-content" },
  },
  tab: {
    alignItems: "center",
    borderRadius: "0.75rem",
    color: { default: tokens.textMuted, ":hover": tokens.text },
    display: "inline-flex",
    flexShrink: 0,
    fontSize: "0.875rem",
    fontWeight: 500,
    gap: "0.5rem",
    height: "2.5rem",
    lineHeight: "1.25rem",
    outline: "none",
    paddingInline: "0.875rem",
    position: "relative",
    transition: "color 150ms",
    zIndex: 10,
    "[data-active]": { color: tokens.text },
    ":focus-visible": { outline: `2px solid ${tokens.oliveSoft}`, outlineOffset: -2 },
  },
  tabIcon: { height: "1rem", width: "1rem" },
  indicator: {
    backgroundColor: tokens.surface,
    borderColor: tokens.border,
    borderRadius: "0.75rem",
    borderStyle: "solid",
    borderWidth: 1,
    boxShadow: "0 1px 3px rgb(0 0 0 / 0.08)",
    height: "2.5rem",
    left: 0,
    position: "absolute",
    top: "0.375rem",
    transform: "translateX(var(--active-tab-left))",
    transition: "transform 200ms var(--ease-out-quart), width 200ms var(--ease-out-quart)",
    width: "var(--active-tab-width)",
  },
  panel: {
    marginTop: "1.75rem",
    outline: "none",
    "[data-hidden]": { display: "none" },
    ":focus-visible": { outline: `2px solid ${tokens.oliveSoft}`, outlineOffset: 2 },
  },
});

export default function PlaygroundPage() {
  return (
    <div {...stylex.props(styles.page)}>
      <div {...stylex.props(styles.content)}>
        <header {...stylex.props(styles.header)}>
          <FlaskIcon weight="fill" className={stylex.props(styles.headerIcon).className} />
          <h1 {...stylex.props(styles.title)}>Development playground</h1>
        </header>

        <Tabs.Root defaultValue="ocr" className={stylex.props(styles.tabs).className}>
          <Tabs.List activateOnFocus className={stylex.props(styles.tabList).className}>
            <Tabs.Tab value="ocr" className={stylex.props(styles.tab).className}>
              <ScanIcon className={stylex.props(styles.tabIcon).className} />
              OCR engines
            </Tabs.Tab>
            <Tabs.Tab value="documents" className={stylex.props(styles.tab).className}>
              <FileSearchIcon className={stylex.props(styles.tabIcon).className} />
              Image pipeline
            </Tabs.Tab>
            <Tabs.Tab value="document-parsing" className={stylex.props(styles.tab).className}>
              <FileSearchIcon className={stylex.props(styles.tabIcon).className} />
              Document parsing
            </Tabs.Tab>
            <Tabs.Tab value="grounded-retrieval" className={stylex.props(styles.tab).className}>
              <BrainIcon className={stylex.props(styles.tabIcon).className} />
              Grounded AI
            </Tabs.Tab>
            <Tabs.Tab value="vector-db" className={stylex.props(styles.tab).className}>
              <DatabaseIcon className={stylex.props(styles.tabIcon).className} />
              Vector DB
            </Tabs.Tab>
            <Tabs.Tab value="local-models" className={stylex.props(styles.tab).className}>
              <MicrophoneStageIcon className={stylex.props(styles.tabIcon).className} />
              Local models
            </Tabs.Tab>
            <Tabs.Tab value="datasets" className={stylex.props(styles.tab).className}>
              <HardDrivesIcon className={stylex.props(styles.tabIcon).className} />
              Datasets
            </Tabs.Tab>
            <Tabs.Tab value="mascot" className={stylex.props(styles.tab).className}>
              <SmileyIcon className={stylex.props(styles.tabIcon).className} />
              Mascot
            </Tabs.Tab>
            <Tabs.Indicator className={stylex.props(styles.indicator).className} />
          </Tabs.List>

          <Tabs.Panel value="datasets" className={stylex.props(styles.panel).className}>
            <DatasetInstaller />
          </Tabs.Panel>
          <Tabs.Panel value="ocr" className={stylex.props(styles.panel).className}>
            <OcrBenchmark />
          </Tabs.Panel>
          <Tabs.Panel value="documents" className={stylex.props(styles.panel).className}>
            <ImageDocumentPipeline />
          </Tabs.Panel>
          <Tabs.Panel value="document-parsing" className={stylex.props(styles.panel).className}>
            <DocumentParsing />
          </Tabs.Panel>
          <Tabs.Panel value="grounded-retrieval" className={stylex.props(styles.panel).className}>
            <GroundedRetrieval />
          </Tabs.Panel>
          <Tabs.Panel value="vector-db" className={stylex.props(styles.panel).className}>
            <VectorDbInspector />
          </Tabs.Panel>
          <Tabs.Panel
            value="local-models"
            keepMounted
            className={stylex.props(styles.panel).className}
          >
            <AsrEvaluation />
          </Tabs.Panel>
          <Tabs.Panel value="mascot" className={stylex.props(styles.panel).className}>
            <MascotShowcase />
          </Tabs.Panel>
        </Tabs.Root>
      </div>
    </div>
  );
}
