"use client";

import { ConversationProvider, useConversation } from "@elevenlabs/react";
import {
  Captions,
  CirclePause,
  Keyboard,
  Mic,
  MicOff,
  Play,
  Square,
  Volume2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { Locale } from "@/lib/contracts";

const SignedSessionSchema = z
  .object({
    signedUrl: z.url(),
    sessionNonce: z.string().min(8).max(100),
    expiresAt: z.number().int().positive(),
  })
  .strict();

const VoiceMessageSchema = z
  .object({
    message: z.string().trim().min(1).max(4_000),
    role: z.enum(["user", "agent"]),
    event_id: z.number().int().nonnegative().optional(),
  })
  .passthrough();

type VoiceSessionPhase =
  | "idle"
  | "requesting"
  | "connecting"
  | "connected"
  | "ending"
  | "ended"
  | "error";

type CaptionTurn = Readonly<{
  id: string;
  message: string;
  role: "user" | "agent";
}>;

const MAX_VISIBLE_CAPTIONS = 8;
const CONNECTION_TIMEOUT_MS = 20_000;

/** Marks an error message as intentionally safe to render in the browser. */
class PublicVoiceError extends Error {
  /** Creates a user-facing voice error from application-controlled copy. */
  constructor(message: string) {
    super(message);
    this.name = "PublicVoiceError";
  }
}

/** Converts an SDK audio level into a bounded percentage for a visual meter. */
function toMeterPercentage(level: number): number {
  if (!Number.isFinite(level)) return 0;
  return Math.round(Math.min(1, Math.max(0, level)) * 100);
}

/** Reports lifecycle metadata without logging transcripts, signed URLs, or user identifiers. */
function reportVoiceLifecycle(
  event: string,
  details: Readonly<Record<string, string | number | boolean>> = {},
): void {
  console.info("[voice-session]", { event, ...details });
}

/** Converts a browser or SDK failure into a bounded, non-sensitive user-facing message. */
function describeVoiceFailure(caught: unknown): string {
  if (caught instanceof DOMException) {
    if (caught.name === "NotAllowedError") {
      return "Microphone access was denied. Allow microphone access in Chrome, then try again.";
    }
    if (caught.name === "NotFoundError") {
      return "No microphone was found. Connect a microphone, then try again.";
    }
    if (caught.name === "NotReadableError") {
      return "The microphone is busy or unavailable. Close other audio apps, then try again.";
    }
  }
  if (caught instanceof PublicVoiceError && caught.message.length <= 300) {
    return caught.message;
  }
  return "The private voice session could not be started.";
}

/** Returns the localized label for one client-side voice lifecycle phase. */
function getPhaseLabel(phase: VoiceSessionPhase, hindi: boolean): string {
  const labels: Readonly<Record<VoiceSessionPhase, readonly [string, string]>> =
    {
      idle: ["Ready", "तैयार"],
      requesting: ["Preparing", "तैयारी हो रही है"],
      connecting: ["Connecting", "जोड़ रहा है"],
      connected: ["Live", "लाइव"],
      ending: ["Ending", "समाप्त हो रहा है"],
      ended: ["Ended", "समाप्त"],
      error: ["Needs attention", "ध्यान देने की ज़रूरत है"],
    };
  return labels[phase][hindi ? 1 : 0];
}

/** Reads a redacted public error message from a failed session request. */
async function readPublicError(response: Response): Promise<string> {
  try {
    const parsed = z
      .object({ message: z.string().min(1).max(300) })
      .passthrough()
      .safeParse(await response.json());
    if (parsed.success) return parsed.data.message;
  } catch {
    // The generic fallback below intentionally hides malformed upstream bodies.
  }
  return "A private voice session could not be started.";
}

/** Authenticated browser voice controls backed by a short-lived signed URL. */
function LiveVoiceControls({ locale }: Readonly<{ locale: Locale }>) {
  const [phase, setPhase] = useState<VoiceSessionPhase>("idle");
  const [error, setError] = useState<string | undefined>();
  const [textMode, setTextMode] = useState(false);
  const [draft, setDraft] = useState("");
  const [captions, setCaptions] = useState<readonly CaptionTurn[]>([]);
  const [inputLevel, setInputLevel] = useState(0);
  const [outputLevel, setOutputLevel] = useState(0);
  const attemptRef = useRef(0);
  const captionSequenceRef = useRef(0);
  const requestAbortRef = useRef<AbortController | undefined>(undefined);
  const disconnectAsErrorRef = useRef(false);
  const connectionTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const endTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const hindi = locale === "hi-IN";

  const conversation = useConversation({
    onConnect: () => {
      if (connectionTimerRef.current !== undefined) {
        clearTimeout(connectionTimerRef.current);
        connectionTimerRef.current = undefined;
      }
      setError(undefined);
      setPhase("connected");
      reportVoiceLifecycle("connected");
    },
    onDisconnect: (details) => {
      if (connectionTimerRef.current !== undefined) {
        clearTimeout(connectionTimerRef.current);
        connectionTimerRef.current = undefined;
      }
      if (endTimerRef.current !== undefined) {
        clearTimeout(endTimerRef.current);
        endTimerRef.current = undefined;
      }
      setInputLevel(0);
      setOutputLevel(0);
      const shouldShowError =
        details.reason === "error" || disconnectAsErrorRef.current;
      disconnectAsErrorRef.current = false;
      if (shouldShowError) {
        setError(
          "The voice connection stopped unexpectedly. Please start a new session.",
        );
        setPhase("error");
      } else {
        setPhase("ended");
      }
      reportVoiceLifecycle("disconnected", { reason: details.reason });
    },
    onError: (message) => {
      if (connectionTimerRef.current !== undefined) {
        clearTimeout(connectionTimerRef.current);
        connectionTimerRef.current = undefined;
      }
      setError(
        "The voice connection encountered an error. Please start a new session.",
      );
      setInputLevel(0);
      setOutputLevel(0);
      setPhase("error");
      reportVoiceLifecycle("error", {
        upstreamMessageLength: message.length,
      });
    },
    onMessage: (payload) => {
      const parsed = VoiceMessageSchema.safeParse(payload);
      if (!parsed.success) {
        reportVoiceLifecycle("invalid-caption-payload");
        return;
      }
      captionSequenceRef.current += 1;
      const caption: CaptionTurn = {
        id: `${parsed.data.role}-${parsed.data.event_id ?? "local"}-${captionSequenceRef.current}`,
        message: parsed.data.message,
        role: parsed.data.role,
      };
      setCaptions((current) =>
        [...current, caption].slice(-MAX_VISIBLE_CAPTIONS),
      );
      reportVoiceLifecycle("caption-received", {
        role: caption.role,
        characters: caption.message.length,
      });
    },
    onModeChange: ({ mode }) => {
      reportVoiceLifecycle("mode-changed", { mode });
    },
    onStatusChange: ({ status }) => {
      reportVoiceLifecycle("status-changed", { status });
      if (status === "connecting") {
        setPhase((current) => (current === "ending" ? current : "connecting"));
      } else if (status === "connected") {
        setPhase("connected");
      } else if (status === "disconnecting") {
        setPhase("ending");
      }
    },
  });

  const connected = phase === "connected";
  const sessionInProgress =
    phase === "requesting" ||
    phase === "connecting" ||
    phase === "connected" ||
    phase === "ending";
  const getInputVolume = conversation.getInputVolume;
  const getOutputVolume = conversation.getOutputVolume;
  const setConversationVolume = conversation.setVolume;

  useEffect(() => {
    if (!connected) return undefined;

    setConversationVolume({ volume: 1 });
    const meterTimer = window.setInterval(() => {
      setInputLevel(toMeterPercentage(getInputVolume()));
      setOutputLevel(toMeterPercentage(getOutputVolume()));
    }, 150);
    return () => window.clearInterval(meterTimer);
  }, [connected, getInputVolume, getOutputVolume, setConversationVolume]);

  useEffect(
    () => () => {
      requestAbortRef.current?.abort();
      if (connectionTimerRef.current !== undefined) {
        clearTimeout(connectionTimerRef.current);
      }
      if (endTimerRef.current !== undefined) clearTimeout(endTimerRef.current);
    },
    [],
  );

  /** Requests microphone permission and starts one authenticated private session. */
  const start = async (): Promise<void> => {
    if (sessionInProgress) return;
    const attempt = attemptRef.current + 1;
    attemptRef.current = attempt;
    requestAbortRef.current?.abort();
    const controller = new AbortController();
    requestAbortRef.current = controller;
    disconnectAsErrorRef.current = false;
    setPhase("requesting");
    setError(undefined);
    setCaptions([]);
    setInputLevel(0);
    setOutputLevel(0);
    setTextMode(false);
    setDraft("");
    reportVoiceLifecycle("start-requested", { locale });
    try {
      if (!window.isSecureContext) {
        throw new PublicVoiceError(
          "Voice check-ins require a secure browser context such as HTTPS or localhost.",
        );
      }
      if (navigator.mediaDevices?.getUserMedia === undefined) {
        throw new PublicVoiceError(
          "This browser does not provide microphone access. Use a current version of Chrome.",
        );
      }
      if (
        window.AudioContext === undefined ||
        !("audioWorklet" in window.AudioContext.prototype)
      ) {
        throw new PublicVoiceError(
          "This browser does not support the audio processing required for a voice check-in.",
        );
      }
      const microphone = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      for (const track of microphone.getTracks()) track.stop();
      if (attempt !== attemptRef.current) return;
      const response = await fetch("/api/elevenlabs/signed-url", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale }),
        signal: controller.signal,
      });
      if (attempt !== attemptRef.current) return;
      if (!response.ok) {
        throw new PublicVoiceError(await readPublicError(response));
      }
      const session = SignedSessionSchema.parse(await response.json());
      if (attempt !== attemptRef.current) return;
      setPhase("connecting");
      connectionTimerRef.current = setTimeout(() => {
        if (attempt !== attemptRef.current) return;
        attemptRef.current += 1;
        disconnectAsErrorRef.current = true;
        conversation.endSession();
        setError(
          "The voice service did not connect within 20 seconds. Please try again.",
        );
        setPhase("error");
        reportVoiceLifecycle("connection-timeout");
      }, CONNECTION_TIMEOUT_MS);

      // The installed React SDK intentionally exposes a callback-driven void API.
      conversation.startSession({
        signedUrl: session.signedUrl,
        connectionType: "websocket",
        dynamicVariables: { cable_session_nonce: session.sessionNonce },
        workletPaths: {
          rawAudioProcessor: "/audio-worklets/raw-audio-processor.js",
          audioConcatProcessor: "/audio-worklets/audio-concat-processor.js",
        },
      });
    } catch (caught: unknown) {
      if (attempt !== attemptRef.current) return;
      if (caught instanceof DOMException && caught.name === "AbortError")
        return;
      setError(describeVoiceFailure(caught));
      setPhase("error");
      reportVoiceLifecycle("start-failed", {
        errorType: caught instanceof Error ? caught.name : "unknown",
      });
    } finally {
      if (requestAbortRef.current === controller) {
        requestAbortRef.current = undefined;
      }
    }
  };

  /** Cancels a pending start or ends the active private voice session. */
  const end = (): void => {
    if (!sessionInProgress || phase === "ending") return;
    attemptRef.current += 1;
    requestAbortRef.current?.abort();
    requestAbortRef.current = undefined;
    disconnectAsErrorRef.current = false;
    if (connectionTimerRef.current !== undefined) {
      clearTimeout(connectionTimerRef.current);
      connectionTimerRef.current = undefined;
    }
    setPhase("ending");
    setTextMode(false);
    setDraft("");
    reportVoiceLifecycle("end-requested");
    try {
      conversation.endSession();
      endTimerRef.current = setTimeout(() => {
        setInputLevel(0);
        setOutputLevel(0);
        setPhase((current) => (current === "ending" ? "ended" : current));
        endTimerRef.current = undefined;
      }, 300);
    } catch (caught: unknown) {
      setError(describeVoiceFailure(caught));
      setPhase("error");
      reportVoiceLifecycle("end-failed", {
        errorType: caught instanceof Error ? caught.name : "unknown",
      });
    }
  };

  /** Sends one bounded user-authored text turn over the active private session. */
  const sendText = (): void => {
    const text = draft.trim();
    if (!connected || text.length === 0 || text.length > 1_000) return;
    try {
      conversation.sendUserMessage(text);
      setDraft("");
    } catch (caught: unknown) {
      setError(describeVoiceFailure(caught));
      reportVoiceLifecycle("text-turn-failed");
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <Card className="border-primary/20 shadow-lg shadow-primary/5">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Badge variant="outline">
              <Mic aria-hidden="true" />
              {hindi ? "निजी वॉइस सत्र" : "Private voice session"}
            </Badge>
            <Badge variant={connected ? "default" : "secondary"}>
              {getPhaseLabel(phase, hindi)}
            </Badge>
          </div>
          <CardTitle className="text-3xl">
            {hindi ? "अपना चेक-इन शुरू करें" : "Start your check-in"}
          </CardTitle>
          <CardDescription className="text-base leading-7">
            {hindi
              ? "माइक्रोफ़ोन तभी चालू होता है जब आप शुरू करें। कच्ची ऑडियो फ़ाइल संग्रहीत नहीं की जाती।"
              : "The microphone activates only after you start. No raw audio file is stored."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <div
            className="min-h-28 rounded-2xl border bg-muted/35 p-5"
            aria-live="polite"
            aria-atomic="true"
          >
            <div className="flex items-center gap-2 text-sm font-semibold text-primary">
              <Captions aria-hidden="true" className="size-4" />
              {hindi ? "कैप्शन" : "Captions"}
            </div>
            {captions.length === 0 ? (
              <p className="mt-3 text-lg leading-8">
                {connected
                  ? hindi
                    ? "कनेक्शन तैयार है। बोलना शुरू करें—आपकी बात यहाँ दिखाई देगी।"
                    : "Connected. Start speaking—what you and C.A.B.L.E say will appear here."
                  : hindi
                    ? "सत्र शुरू होने के बाद बातचीत के कैप्शन यहाँ दिखाई देंगे।"
                    : "Conversation captions will appear here after the session starts."}
              </p>
            ) : (
              <ol className="mt-3 flex flex-col gap-3" aria-live="polite">
                {captions.map((caption) => (
                  <li key={caption.id} className="text-lg leading-8">
                    <span className="font-semibold text-primary">
                      {caption.role === "user"
                        ? hindi
                          ? "आप: "
                          : "You: "
                        : "C.A.B.L.E: "}
                    </span>
                    {caption.message}
                  </li>
                ))}
              </ol>
            )}
          </div>

          {connected ? (
            <div className="grid gap-3 rounded-2xl border bg-background p-4 sm:grid-cols-2">
              <div>
                <div className="mb-2 flex items-center justify-between gap-3 text-sm font-medium">
                  <span>{hindi ? "आपका माइक्रोफ़ोन" : "Your microphone"}</span>
                  <span>{inputLevel}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-[width] duration-150"
                    style={{ width: `${inputLevel}%` }}
                  />
                </div>
              </div>
              <div>
                <div className="mb-2 flex items-center justify-between gap-3 text-sm font-medium">
                  <span>
                    {hindi ? "C.A.B.L.E की आवाज़" : "C.A.B.L.E audio"}
                  </span>
                  <span>{outputLevel}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-accent-foreground transition-[width] duration-150"
                    style={{ width: `${outputLevel}%` }}
                  />
                </div>
              </div>
              <p className="text-muted-foreground text-sm sm:col-span-2">
                {conversation.isSpeaking
                  ? hindi
                    ? "C.A.B.L.E बोल रहा है…"
                    : "C.A.B.L.E is speaking…"
                  : conversation.isMuted
                    ? hindi
                      ? "माइक्रोफ़ोन रुका हुआ है।"
                      : "Microphone paused."
                    : hindi
                      ? "सुन रहा है—अब बोलें।"
                      : "Listening—speak now."}
              </p>
            </div>
          ) : undefined}

          <div className="flex flex-wrap gap-3">
            {!sessionInProgress ? (
              <Button
                size="lg"
                className="min-h-14"
                onClick={() => void start()}
              >
                <Play aria-hidden="true" />
                {hindi ? "वॉइस चेक-इन शुरू करें" : "Start voice check-in"}
              </Button>
            ) : (
              <>
                {connected ? (
                  <>
                    <Button
                      size="lg"
                      variant="secondary"
                      className="min-h-14"
                      onClick={() =>
                        conversation.setMuted(!conversation.isMuted)
                      }
                    >
                      {conversation.isMuted ? (
                        <MicOff aria-hidden="true" />
                      ) : (
                        <CirclePause aria-hidden="true" />
                      )}
                      {conversation.isMuted
                        ? hindi
                          ? "फिर सुनें"
                          : "Resume listening"
                        : hindi
                          ? "सुनना रोकें"
                          : "Pause listening"}
                    </Button>
                    <Button
                      size="lg"
                      variant="outline"
                      className="min-h-14"
                      onClick={() => setTextMode((value) => !value)}
                    >
                      <Keyboard aria-hidden="true" />
                      {hindi ? "लिखकर बताएँ" : "Use text"}
                    </Button>
                  </>
                ) : undefined}
                <Button
                  size="lg"
                  variant="destructive"
                  className="min-h-14"
                  onClick={end}
                  disabled={phase === "ending"}
                >
                  <Square aria-hidden="true" />
                  {phase === "ending"
                    ? hindi
                      ? "समाप्त हो रहा है…"
                      : "Ending…"
                    : hindi
                      ? "सत्र समाप्त करें"
                      : "End session"}
                </Button>
              </>
            )}
          </div>

          {textMode && connected ? (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                sendText();
              }}
            >
              <FieldGroup>
                <Field orientation="responsive" className="gap-3">
                  <FieldLabel htmlFor="voice-text-turn" className="sr-only">
                    {hindi ? "चेक-इन संदेश" : "Check-in message"}
                  </FieldLabel>
                  <Input
                    id="voice-text-turn"
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    maxLength={1_000}
                    placeholder={hindi ? "यहाँ लिखें…" : "Type here…"}
                    className="min-h-12 flex-1"
                  />
                  <Button type="submit" className="min-h-12">
                    {hindi ? "भेजें" : "Send"}
                  </Button>
                </Field>
              </FieldGroup>
            </form>
          ) : undefined}

          {error === undefined ? undefined : (
            <Alert variant="destructive" role="alert">
              <MicOff aria-hidden="true" />
              <AlertTitle>
                {hindi ? "सत्र शुरू नहीं हुआ" : "Session did not start"}
              </AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <Alert>
        <Volume2 aria-hidden="true" />
        <AlertTitle>
          {hindi ? "साझा करने से पहले समीक्षा" : "Review before sharing"}
        </AlertTitle>
        <AlertDescription>
          {hindi
            ? "C.A.B.L.E पहले हिंदी तथ्य पढ़कर सुनाता है, फिर सटीक अंग्रेज़ी प्रकटीकरण दिखाता है और स्पष्ट सहमति माँगता है।"
            : "C.A.B.L.E first reads back the Hindi facts, then shows the exact English disclosure and asks for explicit consent."}
        </AlertDescription>
      </Alert>
    </div>
  );
}

/** Provides the ElevenLabs conversation context without exposing an agent ID or API key. */
export function LiveVoiceCheckin({ locale }: Readonly<{ locale: Locale }>) {
  return (
    <ConversationProvider>
      <LiveVoiceControls locale={locale} />
    </ConversationProvider>
  );
}
