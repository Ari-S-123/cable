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
import { useState } from "react";
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
  const [requesting, setRequesting] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [textMode, setTextMode] = useState(false);
  const [draft, setDraft] = useState("");
  const conversation = useConversation();
  const connected = conversation.status === "connected";
  const hindi = locale === "hi-IN";

  /** Requests microphone permission and starts one authenticated private session. */
  const start = async (): Promise<void> => {
    setRequesting(true);
    setError(undefined);
    try {
      const microphone = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      for (const track of microphone.getTracks()) track.stop();
      const response = await fetch("/api/elevenlabs/signed-url", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale }),
      });
      if (!response.ok) throw new Error(await readPublicError(response));
      const session = SignedSessionSchema.parse(await response.json());
      await conversation.startSession({
        signedUrl: session.signedUrl,
        connectionType: "websocket",
        dynamicVariables: { cable_session_nonce: session.sessionNonce },
        overrides: { agent: { language: hindi ? "hi" : "en" } },
      });
    } catch (caught: unknown) {
      setError(
        caught instanceof Error
          ? caught.message
          : "A private voice session could not be started.",
      );
    } finally {
      setRequesting(false);
    }
  };

  /** Sends one bounded user-authored text turn over the active private session. */
  const sendText = (): void => {
    const text = draft.trim();
    if (!connected || text.length === 0 || text.length > 1_000) return;
    conversation.sendUserMessage(text);
    setDraft("");
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
              {conversation.status}
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
            <p className="mt-3 text-lg leading-8">
              {conversation.message ??
                (hindi
                  ? "सत्र शुरू होने के बाद बातचीत का वर्तमान कैप्शन यहाँ दिखाई देगा।"
                  : "The current conversation caption will appear here after the session starts.")}
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            {!connected ? (
              <Button
                size="lg"
                className="min-h-14"
                onClick={() => void start()}
                disabled={requesting || conversation.status === "connecting"}
              >
                <Play aria-hidden="true" />
                {requesting || conversation.status === "connecting"
                  ? hindi
                    ? "जोड़ रहा है…"
                    : "Connecting…"
                  : hindi
                    ? "वॉइस चेक-इन शुरू करें"
                    : "Start voice check-in"}
              </Button>
            ) : (
              <>
                <Button
                  size="lg"
                  variant="secondary"
                  className="min-h-14"
                  onClick={() => conversation.setMuted(!conversation.isMuted)}
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
                <Button
                  size="lg"
                  variant="destructive"
                  className="min-h-14"
                  onClick={() => conversation.endSession()}
                >
                  <Square aria-hidden="true" />
                  {hindi ? "सत्र समाप्त करें" : "End session"}
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
