import { file as opfsFile } from "@memora/fs";
import { useEffect, useState } from "react";

/** An object URL for an image stored in OPFS, or null while loading or if it can't be read. */
export const useOpfsImageUrl = (path: string | undefined): string | null => {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!path) return;
    let objectUrl: string | null = null;
    let cancelled = false;
    // OPFS hands back a disk-backed File, so the URL doesn't copy the image into memory.
    void opfsFile(path)
      .getOriginFile()
      .then((image) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(image);
        setUrl(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setUrl(null);
      });
    return () => {
      cancelled = true;
      setUrl(null);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path]);

  return path ? url : null;
};
