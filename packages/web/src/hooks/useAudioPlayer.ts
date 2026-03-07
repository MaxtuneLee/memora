import { useCallback, useEffect, useRef, useState } from "react";

const SMOOTHING_FACTOR = 0.22;

export const useAudioPlayer = (
  audioRef: React.RefObject<HTMLAudioElement | null>,
  readyToken: number,
  fallbackDuration?: number,
) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);

  const lastFrameTimeRef = useRef<number | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const displayTimeRef = useRef(0);
  const targetTimeRef = useRef(0);

  useEffect(() => {
    if (!isPlaying) {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      lastFrameTimeRef.current = null;
      return;
    }

    const animate = (timestamp: number) => {
      if (lastFrameTimeRef.current !== null) {
        const deltaMs = timestamp - lastFrameTimeRef.current;
        const deltaSec = deltaMs / 1000;

        const audio = audioRef.current;
        const playbackRate = audio?.playbackRate ?? 1;
        const maxTime = duration || audio?.duration || Infinity;

        if (audio && Number.isFinite(audio.currentTime)) {
          targetTimeRef.current = audio.currentTime;
        }

        let predictedTime = displayTimeRef.current + deltaSec * playbackRate;
        predictedTime = Math.min(predictedTime, maxTime);
        predictedTime = Math.max(predictedTime, 0);

        const targetTime = targetTimeRef.current || predictedTime;
        const correction = Math.max(
          -0.12,
          Math.min(0.12, targetTime - predictedTime),
        );
        const blendedTime = predictedTime + correction * SMOOTHING_FACTOR;

        displayTimeRef.current = blendedTime;
      }

      lastFrameTimeRef.current = timestamp;
      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      lastFrameTimeRef.current = null;
    };
  }, [isPlaying, duration, audioRef]);

  const syncToAudio = useCallback(
    (forceSnap = false) => {
      const audio = audioRef.current;
      if (!audio) return;

      const audioTime = audio.currentTime;
      targetTimeRef.current = audioTime;

      if (forceSnap) {
        displayTimeRef.current = audioTime;
      }
    },
    [audioRef],
  );

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => {
      syncToAudio(false);
    };

    const handleSeeked = () => {
      syncToAudio(true);
    };

    const handleLoaded = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        setDuration(audio.duration);
      } else if (fallbackDuration && fallbackDuration > 0) {
        setDuration(fallbackDuration);
      } else {
        setDuration(0);
      }
      syncToAudio(true);
    };

    const handlePlay = () => {
      syncToAudio(true);
      setIsPlaying(true);
    };

    const handlePause = () => {
      setIsPlaying(false);
      syncToAudio(true);
    };

    const handleEnded = () => {
      setIsPlaying(false);
      syncToAudio(true);
    };

    const handleRateChange = () => {
      syncToAudio(true);
    };

    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("loadedmetadata", handleLoaded);
    audio.addEventListener("durationchange", handleLoaded);
    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("seeked", handleSeeked);
    audio.addEventListener("ratechange", handleRateChange);

    if (Number.isFinite(audio.duration) && audio.duration > 0) {
      setDuration(audio.duration);
    }
    syncToAudio(true);

    return () => {
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("loadedmetadata", handleLoaded);
      audio.removeEventListener("durationchange", handleLoaded);
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("seeked", handleSeeked);
      audio.removeEventListener("ratechange", handleRateChange);
    };
  }, [audioRef, readyToken, fallbackDuration, syncToAudio]);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      void audio.play();
    } else {
      audio.pause();
    }
  }, [audioRef]);

  const seek = useCallback(
    (time: number) => {
      const audio = audioRef.current;
      if (!audio) return;
      const clampedTime = Math.min(
        Math.max(time, 0),
        duration || audio.duration || 0,
      );
      audio.currentTime = clampedTime;
      displayTimeRef.current = clampedTime;
    },
    [audioRef, duration],
  );

  return {
    isPlaying,
    displayTimeRef,
    duration,
    togglePlay,
    seek,
  };
};
