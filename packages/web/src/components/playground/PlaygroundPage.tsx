import { Tabs } from "@base-ui/react/tabs";
import {
  BrainIcon,
  DatabaseIcon,
  FileSearchIcon,
  FlaskIcon,
  HardDrivesIcon,
  MicrophoneStageIcon,
  ScanIcon,
} from "@phosphor-icons/react";

import DocumentParsing from "./DocumentParsing";
import OcrBenchmark from "./OcrBenchmark";
import ImageDocumentPipeline from "./ImageDocumentPipeline";
import GroundedRetrieval from "./GroundedRetrieval";
import VectorDbInspector from "./VectorDbInspector";
import DatasetInstaller from "./DatasetInstaller";
import AsrEvaluation from "./AsrEvaluation";

const TAB_CLASS_NAME =
  "relative z-10 inline-flex h-10 shrink-0 items-center gap-2 rounded-xl px-3.5 text-sm font-medium text-memora-text-muted outline-none transition-colors hover:text-memora-text focus-visible:ring-2 focus-visible:ring-memora-olive-soft data-active:text-memora-text";

export default function PlaygroundPage() {
  return (
    <div className="min-h-full bg-memora-canvas px-5 py-7 sm:px-8 sm:py-9 lg:px-10">
      <div className="mx-auto w-full max-w-[1480px]">
        <header className="flex items-center gap-3 pb-7">
          <FlaskIcon weight="fill" className="size-5 text-memora-olive" />
          <h1 className="font-serif text-2xl font-medium tracking-[-0.025em] text-memora-text-strong sm:text-3xl">
            Development playground
          </h1>
        </header>

        <Tabs.Root defaultValue="ocr" className="mt-7">
          <Tabs.List
            activateOnFocus
            className="relative flex w-full gap-1 overflow-x-auto rounded-2xl bg-memora-surface-muted p-1.5 sm:w-fit"
          >
            <Tabs.Tab value="ocr" className={TAB_CLASS_NAME}>
              <ScanIcon className="size-4" />
              OCR engines
            </Tabs.Tab>
            <Tabs.Tab value="documents" className={TAB_CLASS_NAME}>
              <FileSearchIcon className="size-4" />
              Image pipeline
            </Tabs.Tab>
            <Tabs.Tab value="document-parsing" className={TAB_CLASS_NAME}>
              <FileSearchIcon className="size-4" />
              Document parsing
            </Tabs.Tab>
            <Tabs.Tab value="grounded-retrieval" className={TAB_CLASS_NAME}>
              <BrainIcon className="size-4" />
              Grounded AI
            </Tabs.Tab>
            <Tabs.Tab value="vector-db" className={TAB_CLASS_NAME}>
              <DatabaseIcon className="size-4" />
              Vector DB
            </Tabs.Tab>
            <Tabs.Tab value="local-models" className={TAB_CLASS_NAME}>
              <MicrophoneStageIcon className="size-4" />
              Local models
            </Tabs.Tab>
            <Tabs.Tab value="datasets" className={TAB_CLASS_NAME}>
              <HardDrivesIcon className="size-4" />
              Datasets
            </Tabs.Tab>
            <Tabs.Indicator className="absolute top-1.5 left-0 h-10 w-(--active-tab-width) translate-x-(--active-tab-left) rounded-xl border border-memora-border bg-memora-surface shadow-sm-soft transition-[translate,width] duration-200 ease-out-quart" />
          </Tabs.List>

          <Tabs.Panel
            value="datasets"
            className="mt-7 outline-none focus-visible:ring-2 focus-visible:ring-memora-olive-soft [[hidden]]:hidden"
          >
            <DatasetInstaller />
          </Tabs.Panel>
          <Tabs.Panel
            value="ocr"
            className="mt-7 outline-none focus-visible:ring-2 focus-visible:ring-memora-olive-soft [[hidden]]:hidden"
          >
            <OcrBenchmark />
          </Tabs.Panel>
          <Tabs.Panel
            value="documents"
            className="mt-7 outline-none focus-visible:ring-2 focus-visible:ring-memora-olive-soft [[hidden]]:hidden"
          >
            <ImageDocumentPipeline />
          </Tabs.Panel>
          <Tabs.Panel
            value="document-parsing"
            className="mt-7 outline-none focus-visible:ring-2 focus-visible:ring-memora-olive-soft [[hidden]]:hidden"
          >
            <DocumentParsing />
          </Tabs.Panel>
          <Tabs.Panel
            value="grounded-retrieval"
            className="mt-7 outline-none focus-visible:ring-2 focus-visible:ring-memora-olive-soft [[hidden]]:hidden"
          >
            <GroundedRetrieval />
          </Tabs.Panel>
          <Tabs.Panel
            value="vector-db"
            className="mt-7 outline-none focus-visible:ring-2 focus-visible:ring-memora-olive-soft [[hidden]]:hidden"
          >
            <VectorDbInspector />
          </Tabs.Panel>
          <Tabs.Panel
            value="local-models"
            className="mt-7 outline-none focus-visible:ring-2 focus-visible:ring-memora-olive-soft [[hidden]]:hidden"
          >
            <AsrEvaluation />
          </Tabs.Panel>
        </Tabs.Root>
      </div>
    </div>
  );
}
