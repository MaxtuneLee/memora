import { useCallback, useEffect, useState } from "react";

export const useAudioPlayer = (
  audioRef: React.RefObject<HTMLAudioElement | null>,
  readyToken: number,
  fallbackDuration?: number
) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleLoaded = () => {
      console.log("[Audio] metadata", {
        duration: audio.duration,
        readyState: audio.readyState,
        src: audio.currentSrc,
      });
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        setDuration(audio.duration);
      } else if (fallbackDuration && fallbackDuration > 0) {
        setDuration(fallbackDuration);
      } else {
        setDuration(0);
      }
    };
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleEnded = () => setIsPlaying(false);

    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("loadedmetadata", handleLoaded);
    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("durationchange", handleLoaded);

    if (Number.isFinite(audio.duration) && audio.duration > 0) {
      setDuration(audio.duration);
    }

    return () => {
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("loadedmetadata", handleLoaded);
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("durationchange", handleLoaded);
    };
  }, [audioRef, readyToken, fallbackDuration]);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      audio.play();
    } else {
      audio.pause();
    }
  }, [audioRef]);

  const seek = useCallback(
    (time: number) => {
      const audio = audioRef.current;
      if (!audio) return;
      audio.currentTime = Math.min(
        Math.max(time, 0),
        duration || audio.duration || 0
      );
    },
    [audioRef, duration]
  );

  return {
    isPlaying,
    currentTime,
    duration,
    togglePlay,
    seek,
    setCurrentTime,
  };
};
