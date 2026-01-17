import { Button } from "@base-ui/react/button";

interface ModelLoadCardProps {
  disabled: boolean;
  onLoad: () => void;
}

export const ModelLoadCard = ({ disabled, onLoad }: ModelLoadCardProps) => {
  return (
    <div className="space-y-4">
      <p className="text-center text-sm text-zinc-600">
        Load the transcription model before recording.
      </p>
      <Button
        className="w-full rounded-md bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-transform active:scale-95 hover:bg-zinc-800 focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:ring-offset-2 disabled:bg-zinc-100 disabled:text-zinc-400 disabled:cursor-not-allowed"
        onClick={onLoad}
        disabled={disabled}
      >
        Load Model
      </Button>
    </div>
  );
};
