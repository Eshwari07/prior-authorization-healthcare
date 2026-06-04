"use client";

import { useEffect, useState } from "react";

interface TypewriterTextProps {
  words: string[];
  className?: string;
  speed?: number;
  deleteSpeed?: number;
  pauseDuration?: number;
}

export function TypewriterText({
  words,
  className = "",
  speed = 75,
  deleteSpeed = 35,
  pauseDuration = 2200,
}: TypewriterTextProps) {
  const [displayText, setDisplayText] = useState("");
  const [wordIndex, setWordIndex] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    const currentWord = words[wordIndex];

    if (isPaused) {
      const t = setTimeout(() => { setIsPaused(false); setIsDeleting(true); }, pauseDuration);
      return () => clearTimeout(t);
    }

    if (isDeleting) {
      if (displayText === "") {
        setIsDeleting(false);
        setWordIndex((p) => (p + 1) % words.length);
        return;
      }
      const t = setTimeout(() => setDisplayText((p) => p.slice(0, -1)), deleteSpeed);
      return () => clearTimeout(t);
    }

    if (displayText === currentWord) {
      setIsPaused(true);
      return;
    }

    const t = setTimeout(
      () => setDisplayText(currentWord.slice(0, displayText.length + 1)),
      speed
    );
    return () => clearTimeout(t);
  }, [displayText, wordIndex, isDeleting, isPaused, words, speed, deleteSpeed, pauseDuration]);

  return (
    <span className={className}>
      {displayText}
      <span className="inline-block w-[2px] h-[0.9em] bg-current ml-1 align-middle animate-pulse" />
    </span>
  );
}
