import React, { useState } from "react";
import { Mic, MicOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { type LanguageCode } from "@/lib/i18n";
import { toast } from "sonner";

interface SpeechToTextButtonProps {
  language: LanguageCode;
  onText: (text: string) => void;
}

const speechLocales: Record<LanguageCode, string> = {
  en: "en-IN",
  kn: "kn-IN",
  hi: "hi-IN",
  ta: "ta-IN",
  te: "te-IN"
};

export default function SpeechToTextButton({ language, onText }: SpeechToTextButtonProps) {
  const [isListening, setIsListening] = useState(false);

  const startListening = () => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      toast.error("Speech-to-text is not supported in this browser. Try Chrome or Edge.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = speechLocales[language] || "en-IN";
    recognition.interimResults = false;
    recognition.continuous = false;

    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => {
      setIsListening(false);
      toast.error("Microphone permission is required for speech-to-text.");
    };
    recognition.onresult = (event: any) => {
      const transcript = Array.from(event.results || [])
        .map((result: any) => result?.[0]?.transcript || "")
        .join(" ")
        .trim();

      if (transcript) {
        onText(transcript);
        toast.success("Speech converted to text");
      }
    };

    recognition.start();
  };

  return (
    <Button type="button" variant="outline" size="sm" onClick={startListening} disabled={isListening}>
      {isListening ? <MicOff className="mr-2 h-4 w-4" /> : <Mic className="mr-2 h-4 w-4" />}
      {isListening ? "Listening..." : "Speak"}
    </Button>
  );
}
