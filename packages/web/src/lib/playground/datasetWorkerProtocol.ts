import type {
  DatasetExample,
  FeatureSchema,
  DatasetInspection,
  DatasetSelection,
  EncodedMedia,
  InstallProgress,
  InstalledDataset,
  MediaReference,
} from "@memora/datasets";

export type DatasetWorkerRequest =
  | { id: string; type: "inspect"; datasetId: string; revision?: string; hubUrl?: string }
  | {
      id: string;
      type: "install";
      inspection: DatasetInspection;
      configuration: string;
      splits: string[];
      hubUrl?: string;
    }
  | {
      id: string;
      type: "resolve";
      inspection: DatasetInspection;
      configuration: string;
      split: string;
      hubUrl?: string;
    }
  | { id: string; type: "list" }
  | { id: string; type: "open"; selection: DatasetSelection }
  | { id: string; type: "next"; handleId: string; count: number }
  | { id: string; type: "media"; handleId: string; reference: MediaReference }
  | { id: string; type: "close"; handleId: string }
  | { id: string; type: "delete"; selection: DatasetSelection }
  | { id: string; type: "reserve"; selection: DatasetSelection }
  | { id: string; type: "release"; selection: DatasetSelection }
  | { id: string; type: "cancel"; targetId: string };

export type DatasetWorkerResult =
  | DatasetInspection
  | InstalledDataset[]
  | { handleId: string; length?: number; features: FeatureSchema }
  | DatasetExample[]
  | EncodedMedia
  | null;

export type DatasetWorkerResponse =
  | { id: string; type: "result"; result: DatasetWorkerResult }
  | { id: string; type: "progress"; progress: InstallProgress }
  | { id: string; type: "error"; code?: string; message: string };
