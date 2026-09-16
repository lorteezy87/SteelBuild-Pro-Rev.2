/**
 * useDictation — voice capture for field notes, where the browser offers it.
 *
 * Web Speech recognition is unevenly supported and, in Safari, sends audio to a
 * server. So this is strictly opt-in, per press, and the hook reports
 * `supported: false` rather than degrading silently — a dictate button that does
 * nothing is worse than one that is absent.
 *
 * The transcript is handed back verbatim for the daily log. See
 * `lib/board/assistant.ts`: a log is a contemporaneous record, so the words have
 * to stay the foreman's.
 */

import { useCallback, useEffect, useRef, useState } from "react";

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
}

type RecognitionConstructor = new () => SpeechRecognitionLike;

function recognitionConstructor(): RecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export interface Dictation {
  supported: boolean;
  listening: boolean;
  transcript: string;
  error: string | null;
  start: () => void;
  stop: () => void;
  setTranscript: (text: string) => void;
}

export function useDictation(): Dictation {
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);
  const recognition = useRef<SpeechRecognitionLike | null>(null);
  const supported = recognitionConstructor() !== null;

  // Stop on unmount: a recognizer left running holds the microphone open after
  // the user has navigated away from the board.
  useEffect(
    () => () => {
      try {
        recognition.current?.stop();
      } catch {
        /* already stopped */
      }
    },
    [],
  );

  const start = useCallback(() => {
    const Ctor = recognitionConstructor();
    if (!Ctor) {
      setError("This browser cannot transcribe speech. Type the note instead.");
      return;
    }
    try {
      const instance = new Ctor();
      instance.lang = "en-US";
      instance.continuous = true;
      instance.interimResults = false;
      instance.onresult = (event) => {
        let text = "";
        for (let i = 0; i < event.results.length; i += 1) {
          text += `${event.results[i][0]?.transcript ?? ""} `;
        }
        setTranscript(text.trim());
      };
      instance.onerror = (event) => {
        setError(event.error === "not-allowed" ? "Microphone access was denied." : "Dictation stopped.");
        setListening(false);
      };
      instance.onend = () => setListening(false);
      recognition.current = instance;
      setError(null);
      setListening(true);
      instance.start();
    } catch {
      setError("Dictation could not start.");
      setListening(false);
    }
  }, []);

  const stop = useCallback(() => {
    try {
      recognition.current?.stop();
    } catch {
      /* already stopped */
    }
    setListening(false);
  }, []);

  return { supported, listening, transcript, error, start, stop, setTranscript };
}
