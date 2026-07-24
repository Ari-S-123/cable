"use client";

import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  CirclePause,
  FileCheck2,
  Headphones,
  Languages,
  LockKeyhole,
  MailCheck,
  MessageSquareText,
  Mic,
  PencilLine,
  Play,
  RotateCcw,
  ShieldCheck,
  Square,
  UserRound,
  UsersRound,
  Volume2,
  X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { BrandMark } from "@/components/brand-mark";
import { SkipLink } from "@/components/skip-link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import type { Locale } from "@/lib/contracts";
import type { DemoScenario } from "@/lib/demo/scenarios";
import { cn } from "@/lib/utils";

type DemoPhase =
  | "start"
  | "voice"
  | "facts"
  | "consent"
  | "denied"
  | "review"
  | "approved"
  | "validated"
  | "delivered";
type Persona = "elder" | "caregiver";

const phaseProgress: Readonly<Record<DemoPhase, number>> = {
  start: 0,
  voice: 14,
  facts: 29,
  consent: 43,
  denied: 43,
  review: 57,
  approved: 71,
  validated: 86,
  delivered: 100,
};

const copy = {
  "en-US": {
    demo: "Synthetic demonstration",
    step: "Workflow progress",
    choose: "Choose a fictional scenario",
    chooseBody:
      "Every name, contact, care detail, message, and delivery result is deterministic test data.",
    begin: "Begin private check-in",
    private: "Private session",
    listening: "Simulated listening",
    heard: "Live caption",
    pause: "Pause",
    repeat: "Repeat",
    text: "Use text",
    end: "End",
    continue: "Create private draft",
    facts: "Confirm what C.A.B.L.E heard",
    factsBody:
      "Nothing is shared at this step. Correct the Hindi facts before continuing.",
    confirm: "Yes, these facts are correct",
    correct: "Correct a detail",
    consent: "Review exactly what may be shared",
    caregiverSees: "Caregivers and the provider receive this exact English",
    grant: "Yes, share this exact information",
    deny: "No, keep this private",
    maybe: "Maybe later",
    needsYes:
      "No permission was recorded. C.A.B.L.E needs an unqualified, reviewed yes phrase.",
    deniedTitle: "The event remains private",
    deniedBody:
      "The caregiver sees no event content and no detail-bearing notification is created.",
    restartConsent: "Review consent again",
    caregiver: "Caregiver review",
    caregiverBody:
      "Maya sees only the exact English update covered by Asha's current consent.",
    exactMessage: "Exact provider message",
    edit: "Edit scope (requires new consent)",
    approve: "Approve this exact action",
    approveTitle: "Approve an irreversible external action?",
    approveBody:
      "The synthetic worker will use this exact recipient, channel, action version, and message hash. An edit invalidates this approval.",
    approved: "Caregiver approval recorded",
    validate: "Run isolated policy validation",
    validated: "Daytona policy simulation passed",
    send: "Queue synthetic delivery",
    delivered: "Synthetic delivery accepted",
    deliveredBody:
      "One deterministic provider message was recorded. No network request or live destination was used.",
    another: "Run another scenario",
    elderView: "Elder view",
    caregiverView: "Caregiver view",
  },
  "hi-IN": {
    demo: "कृत्रिम प्रदर्शन",
    step: "कार्यप्रवाह की प्रगति",
    choose: "एक काल्पनिक परिस्थिति चुनें",
    chooseBody:
      "हर नाम, संपर्क, देखभाल विवरण, संदेश और वितरण परिणाम तय किया हुआ परीक्षण डेटा है।",
    begin: "निजी चेक-इन शुरू करें",
    private: "निजी सत्र",
    listening: "कृत्रिम रूप से सुन रहा है",
    heard: "लाइव कैप्शन",
    pause: "रोकें",
    repeat: "दोहराएँ",
    text: "लिखकर बताएँ",
    end: "समाप्त करें",
    continue: "निजी ड्राफ्ट बनाएँ",
    facts: "C.A.B.L.E ने जो सुना उसकी पुष्टि करें",
    factsBody:
      "इस चरण में कुछ साझा नहीं होता। आगे बढ़ने से पहले हिंदी तथ्य ठीक करें।",
    confirm: "हाँ, ये तथ्य सही हैं",
    correct: "विवरण ठीक करें",
    consent: "ठीक-ठीक समीक्षा करें कि क्या साझा हो सकता है",
    caregiverSees: "देखभालकर्ता और प्रदाता को यही सटीक अंग्रेज़ी मिलेगी",
    grant: "हाँ, यही सटीक जानकारी साझा करें",
    deny: "नहीं, इसे निजी रखें",
    maybe: "शायद बाद में",
    needsYes:
      "कोई अनुमति दर्ज नहीं हुई। C.A.B.L.E को बिना शर्त, समीक्षा किया हुआ स्पष्ट ‘हाँ’ चाहिए।",
    deniedTitle: "घटना निजी रहती है",
    deniedBody:
      "देखभालकर्ता को कोई घटना विवरण नहीं दिखता और कोई विवरण वाला संदेश नहीं बनता।",
    restartConsent: "सहमति की फिर समीक्षा करें",
    caregiver: "देखभालकर्ता समीक्षा",
    caregiverBody:
      "माया को केवल वही सटीक अंग्रेज़ी अपडेट दिखता है जो आशा की वर्तमान सहमति में शामिल है।",
    exactMessage: "प्रदाता के लिए सटीक संदेश",
    edit: "दायरा बदलें (नई सहमति चाहिए)",
    approve: "इस सटीक कार्रवाई को मंज़ूर करें",
    approveTitle: "क्या वापस न ली जा सकने वाली बाहरी कार्रवाई मंज़ूर करें?",
    approveBody:
      "कृत्रिम कार्यकर्ता इसी प्राप्तकर्ता, माध्यम, कार्रवाई संस्करण और संदेश हैश का उपयोग करेगा। बदलाव से यह मंज़ूरी अमान्य हो जाएगी।",
    approved: "देखभालकर्ता की मंज़ूरी दर्ज हुई",
    validate: "अलग नीति जाँच चलाएँ",
    validated: "Daytona नीति अनुकरण सफल रहा",
    send: "कृत्रिम वितरण कतार में डालें",
    delivered: "कृत्रिम वितरण स्वीकार हुआ",
    deliveredBody:
      "एक तय किया हुआ प्रदाता संदेश दर्ज हुआ। किसी नेटवर्क अनुरोध या लाइव पते का उपयोग नहीं हुआ।",
    another: "दूसरी परिस्थिति चलाएँ",
    elderView: "बुज़ुर्ग दृश्य",
    caregiverView: "देखभालकर्ता दृश्य",
  },
} as const;

/** Speaks a reviewed Hindi caption through the browser without storing audio. */
function speakHindi(text: string): void {
  if (!("speechSynthesis" in window)) {
    toast.error("This browser does not provide local speech playback.");
    return;
  }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "hi-IN";
  utterance.rate = 0.88;
  window.speechSynthesis.speak(utterance);
}

/** Fully isolated browser state machine for the Hindi-to-English consent workflow. */
export function DemoExperience({
  locale,
  scenarios,
}: Readonly<{ locale: Locale; scenarios: readonly DemoScenario[] }>) {
  const t = copy[locale];
  const [scenarioId, setScenarioId] = useState<DemoScenario["id"]>(
    scenarios[0]?.id ?? "appointment",
  );
  const [phase, setPhase] = useState<DemoPhase>("start");
  const [persona, setPersona] = useState<Persona>("elder");
  const [paused, setPaused] = useState(false);
  const [textMode, setTextMode] = useState(false);
  const [correctionMode, setCorrectionMode] = useState(false);
  const [correctedText, setCorrectedText] = useState("");
  const [eventVersion, setEventVersion] = useState(1);
  const [ambiguous, setAmbiguous] = useState(false);
  const [selectedAction, setSelectedAction] = useState("");
  const mainHeading = useRef<HTMLHeadingElement>(null);
  const scenario = useMemo(
    () =>
      scenarios.find((candidate) => candidate.id === scenarioId) ??
      scenarios[0],
    [scenarioId, scenarios],
  );

  if (scenario === undefined) return null;
  const title = locale === "hi-IN" ? scenario.titleHindi : scenario.title;
  const caregiverPhase =
    persona === "caregiver" &&
    ["review", "approved", "validated", "delivered", "denied"].includes(phase);
  const activeAction =
    scenario.caregiverOptions.find((option) => option.id === selectedAction) ??
    scenario.caregiverOptions[0];

  /** Moves to a phase and restores keyboard/screen-reader focus to the main heading. */
  const move = (next: DemoPhase): void => {
    setPhase(next);
    window.setTimeout(() => mainHeading.current?.focus(), 0);
  };

  /** Resets all mutable state while keeping the selected fictional scenario. */
  const reset = (): void => {
    window.speechSynthesis?.cancel();
    setPhase("start");
    setPersona("elder");
    setPaused(false);
    setTextMode(false);
    setCorrectionMode(false);
    setCorrectedText("");
    setEventVersion(1);
    setAmbiguous(false);
    setSelectedAction("");
  };

  /** Revokes the current synthetic grant before delivery and cancels pending work. */
  const revokeBeforeDelivery = (): void => {
    setPersona("caregiver");
    toast.warning("Consent revoked; pending synthetic delivery canceled.");
    move("denied");
  };

  return (
    <div
      className={cn(
        "reflow-safe min-h-screen",
        persona === "elder" && "elder-surface",
      )}
    >
      <SkipLink
        label={locale === "hi-IN" ? "मुख्य सामग्री पर जाएँ" : undefined}
      />
      <header className="sticky top-0 z-30 border-b bg-background/92 backdrop-blur">
        <div className="mx-auto flex min-h-20 max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-8">
          <Link href={`/${locale}`} aria-label="C.A.B.L.E home">
            <BrandMark />
          </Link>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Badge variant="secondary" className="h-7 px-3">
              <ShieldCheck aria-hidden="true" />
              {t.demo}
            </Badge>
            <Button
              variant={persona === "elder" ? "default" : "outline"}
              size="sm"
              onClick={() => setPersona("elder")}
            >
              <UserRound aria-hidden="true" />
              {t.elderView}
            </Button>
            <Button
              variant={persona === "caregiver" ? "default" : "outline"}
              size="sm"
              onClick={() => setPersona("caregiver")}
              disabled={
                !(
                  [
                    "review",
                    "approved",
                    "validated",
                    "delivered",
                    "denied",
                  ] as DemoPhase[]
                ).includes(phase)
              }
            >
              <UsersRound aria-hidden="true" />
              {t.caregiverView}
            </Button>
          </div>
        </div>
      </header>

      <main
        id="main-content"
        className="mx-auto max-w-7xl px-4 py-8 sm:px-8 sm:py-12"
      >
        <div className="mb-8 grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-primary">
              {caregiverPhase ? (
                <UsersRound aria-hidden="true" className="size-4" />
              ) : (
                <LockKeyhole aria-hidden="true" className="size-4" />
              )}
              {caregiverPhase ? t.caregiver : t.private}
            </div>
            <h1
              ref={mainHeading}
              tabIndex={-1}
              className="mt-2 text-3xl outline-none sm:text-4xl"
            >
              {title}
            </h1>
          </div>
          <div className="w-full sm:min-w-56">
            <div className="mb-2 flex items-center justify-between text-xs font-medium text-muted-foreground">
              <span>{t.step}</span>
              <span>{phaseProgress[phase]}%</span>
            </div>
            <Progress
              value={phaseProgress[phase]}
              aria-label={`${t.step}: ${phaseProgress[phase]}%`}
              className="h-2"
            />
          </div>
        </div>

        <div aria-live="polite" aria-atomic="true" className="sr-only">
          {phase} · {persona}
        </div>

        {phase === "start" && (
          <section
            aria-labelledby="scenario-heading"
            className="phase-enter grid min-w-0 gap-7 lg:grid-cols-[0.8fr_1.2fr]"
          >
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
                C.A.B.L.E demo
              </p>
              <h2 id="scenario-heading" className="mt-3 text-4xl sm:text-5xl">
                {t.choose}
              </h2>
              <p className="mt-4 max-w-xl leading-8 text-muted-foreground">
                {t.chooseBody}
              </p>
              <Alert className="mt-6 border-accent/35 bg-accent/10 p-4">
                <ShieldCheck aria-hidden="true" />
                <AlertTitle>
                  {locale === "hi-IN" ? "केवल परीक्षण डेटा" : "Test data only"}
                </AlertTitle>
                <AlertDescription>
                  {locale === "hi-IN"
                    ? "कोई निदान, दवा सलाह, आपात कॉल, सहमति ओवरराइड या लाइव संदेश नहीं।"
                    : "No diagnosis, medication advice, emergency call, consent override, or live message."}
                </AlertDescription>
              </Alert>
            </div>
            <RadioGroup
              value={scenarioId}
              onValueChange={(value) =>
                setScenarioId(value as DemoScenario["id"])
              }
              className="min-w-0 gap-4"
            >
              {scenarios.map((candidate) => (
                <label
                  htmlFor={`scenario-${candidate.id}`}
                  key={candidate.id}
                  className={cn(
                    "grid min-w-0 cursor-pointer grid-cols-[auto_minmax(0,1fr)] gap-3 rounded-2xl border bg-card p-4 shadow-sm transition sm:gap-4 sm:p-5",
                    scenarioId === candidate.id &&
                      "border-primary ring-2 ring-primary/15",
                  )}
                >
                  <RadioGroupItem
                    id={`scenario-${candidate.id}`}
                    value={candidate.id}
                    className="mt-1"
                  />
                  <span className="min-w-0">
                    <span className="block font-display text-2xl">
                      {locale === "hi-IN"
                        ? candidate.titleHindi
                        : candidate.title}
                    </span>
                    <span
                      lang="hi-IN"
                      className="mt-2 block font-devanagari leading-7 text-muted-foreground"
                    >
                      {candidate.utteranceHindi}
                    </span>
                  </span>
                </label>
              ))}
              <Button
                size="lg"
                className="mt-2 h-auto min-h-12 w-full justify-self-start whitespace-normal sm:w-fit"
                onClick={() => move("voice")}
                data-testid="begin-demo"
              >
                <Mic aria-hidden="true" />
                {t.begin}
                <ArrowRight aria-hidden="true" />
              </Button>
            </RadioGroup>
          </section>
        )}

        {phase === "voice" && (
          <section className="phase-enter grid min-w-0 gap-7 lg:grid-cols-[0.9fr_1.1fr] lg:items-stretch">
            <Card className="border-primary/20 bg-primary py-0 text-primary-foreground">
              <CardContent className="grid min-h-[25rem] place-items-center p-8 text-center">
                <div>
                  <Badge className="bg-white/15 text-white" variant="outline">
                    <LockKeyhole aria-hidden="true" />
                    {t.private}
                  </Badge>
                  <div className="relative mx-auto mt-9 grid size-40 place-items-center rounded-full border border-white/30 bg-white/10 sm:size-48">
                    {!paused && (
                      <span
                        aria-hidden="true"
                        className="absolute inset-0 animate-ping rounded-full border border-white/20 motion-reduce:animate-none"
                      />
                    )}
                    {paused ? (
                      <CirclePause aria-hidden="true" className="size-14" />
                    ) : (
                      <Mic aria-hidden="true" className="size-14" />
                    )}
                  </div>
                  <p className="mt-8 text-sm font-semibold uppercase tracking-[0.18em] text-white/70">
                    {paused ? t.pause : t.listening}
                  </p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <Badge variant="outline">
                    <Headphones aria-hidden="true" /> {t.heard}
                  </Badge>
                  <Badge variant="secondary">hi-IN</Badge>
                </div>
                <CardTitle
                  lang="hi-IN"
                  className="mt-5 font-devanagari text-2xl leading-9"
                >
                  {scenario.utteranceHindi}
                </CardTitle>
                <CardDescription>
                  {locale === "hi-IN"
                    ? "यह कैप्शन केवल इस निजी सत्र में है।"
                    : "This caption exists only inside the private session."}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {textMode && (
                  <div className="mb-5">
                    <label
                      htmlFor="private-turn"
                      className="mb-2 block text-sm font-medium"
                    >
                      {locale === "hi-IN"
                        ? "निजी टेक्स्ट"
                        : "Private text alternative"}
                    </label>
                    <Textarea
                      id="private-turn"
                      defaultValue={scenario.utteranceHindi}
                      lang="hi-IN"
                      className="min-h-28 font-devanagari text-lg"
                    />
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Button
                    variant="outline"
                    onClick={() => setPaused((value) => !value)}
                  >
                    {paused ? (
                      <Play aria-hidden="true" />
                    ) : (
                      <CirclePause aria-hidden="true" />
                    )}
                    {paused ? "Play" : t.pause}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => speakHindi(scenario.utteranceHindi)}
                  >
                    <RotateCcw aria-hidden="true" />
                    {t.repeat}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setTextMode((value) => !value)}
                  >
                    <MessageSquareText aria-hidden="true" />
                    {t.text}
                  </Button>
                  <Button variant="outline" onClick={reset}>
                    <Square aria-hidden="true" />
                    {t.end}
                  </Button>
                </div>
              </CardContent>
              <CardFooter className="justify-end">
                <Button
                  onClick={() => move("facts")}
                  data-testid="create-draft"
                >
                  {t.continue}
                  <ArrowRight aria-hidden="true" />
                </Button>
              </CardFooter>
            </Card>
          </section>
        )}

        {phase === "facts" && (
          <section className="phase-enter grid min-w-0 gap-6 lg:grid-cols-[1.1fr_0.9fr]">
            <Card>
              <CardHeader>
                <Badge variant="secondary" className="mb-3">
                  {locale === "hi-IN"
                    ? `संस्करण ${eventVersion}`
                    : `Version ${eventVersion}`}
                </Badge>
                <CardTitle className="text-3xl">{t.facts}</CardTitle>
                <CardDescription className="text-base">
                  {t.factsBody}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {scenario.confirmedHindi.map((fact, index) => (
                  <div
                    key={fact}
                    className="flex gap-3 rounded-xl bg-secondary/55 p-4"
                  >
                    <CheckCircle2
                      aria-hidden="true"
                      className="mt-1 size-5 shrink-0 text-primary"
                    />
                    <p
                      lang="hi-IN"
                      className="font-devanagari text-lg leading-8"
                    >
                      {correctionMode && index === 0 && correctedText.length > 0
                        ? correctedText
                        : fact}
                    </p>
                  </div>
                ))}
                {correctionMode && (
                  <div>
                    <label
                      htmlFor="fact-correction"
                      className="mb-2 block text-sm font-medium"
                    >
                      {locale === "hi-IN"
                        ? "सुधारा हुआ तथ्य"
                        : "Corrected Hindi fact"}
                    </label>
                    <Textarea
                      id="fact-correction"
                      lang="hi-IN"
                      value={correctedText}
                      onChange={(event) => setCorrectedText(event.target.value)}
                      className="min-h-28 font-devanagari text-lg"
                    />
                    <Button
                      className="mt-3"
                      variant="secondary"
                      onClick={() => {
                        if (correctedText.trim().length === 0) return;
                        setEventVersion((version) => version + 1);
                        setCorrectionMode(false);
                        toast.success(
                          locale === "hi-IN"
                            ? "नया निजी संस्करण बनाया गया।"
                            : "A new private version was created.",
                        );
                      }}
                    >
                      <Check aria-hidden="true" />
                      {locale === "hi-IN" ? "सुधार सहेजें" : "Save correction"}
                    </Button>
                  </div>
                )}
              </CardContent>
              <CardFooter className="flex flex-wrap justify-between gap-3">
                <Button
                  variant="outline"
                  onClick={() => {
                    setCorrectedText(scenario.confirmedHindi[0] ?? "");
                    setCorrectionMode(true);
                  }}
                >
                  <PencilLine aria-hidden="true" />
                  {t.correct}
                </Button>
                <Button
                  onClick={() => move("consent")}
                  data-testid="confirm-facts"
                >
                  <Check aria-hidden="true" />
                  {t.confirm}
                </Button>
              </CardFooter>
            </Card>
            <Card className="bg-card/70">
              <CardHeader>
                <CardDescription>
                  {locale === "hi-IN"
                    ? "आप क्या चाहती हैं"
                    : "Requested outcome"}
                </CardDescription>
                <CardTitle
                  lang="hi-IN"
                  className="font-devanagari text-2xl leading-9"
                >
                  {scenario.requestedOutcomeHindi}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Alert>
                  <LockKeyhole aria-hidden="true" />
                  <AlertTitle>{t.private}</AlertTitle>
                  <AlertDescription>
                    {locale === "hi-IN"
                      ? "देखभालकर्ता अभी यह सामग्री नहीं देख सकता।"
                      : "A caregiver cannot see this content yet."}
                  </AlertDescription>
                </Alert>
              </CardContent>
            </Card>
          </section>
        )}

        {phase === "consent" && (
          <section className="phase-enter grid min-w-0 gap-6 xl:grid-cols-[1fr_1fr]">
            <Card className="border-primary/20">
              <CardHeader>
                <Badge variant="outline" className="mb-3">
                  <Volume2 aria-hidden="true" /> hi-IN ·{" "}
                  {scenario.disclosure.elderPreview.templateVersion}
                </Badge>
                <CardTitle className="text-3xl">{t.consent}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                <div
                  lang="hi-IN"
                  className="rounded-2xl bg-secondary/60 p-5 font-devanagari text-lg leading-9"
                >
                  {scenario.consentPromptHindi}
                </div>
                <Button
                  variant="outline"
                  onClick={() => speakHindi(scenario.consentPromptHindi)}
                >
                  <RotateCcw aria-hidden="true" />
                  {t.repeat}
                </Button>
                {ambiguous && (
                  <Alert variant="destructive" data-testid="ambiguous-alert">
                    <X aria-hidden="true" />
                    <AlertTitle>
                      {locale === "hi-IN"
                        ? "स्पष्ट सहमति नहीं"
                        : "No clear consent"}
                    </AlertTitle>
                    <AlertDescription>{t.needsYes}</AlertDescription>
                  </Alert>
                )}
              </CardContent>
              <CardFooter className="grid gap-3 sm:grid-cols-2">
                <Button
                  onClick={() => {
                    setAmbiguous(false);
                    setPersona("caregiver");
                    setSelectedAction(scenario.caregiverOptions[0]?.id ?? "");
                    move("review");
                  }}
                  data-testid="grant-consent"
                >
                  <Check aria-hidden="true" />
                  {t.grant}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setAmbiguous(false);
                    setPersona("caregiver");
                    move("denied");
                  }}
                  data-testid="deny-consent"
                >
                  <X aria-hidden="true" />
                  {t.deny}
                </Button>
                <Button
                  variant="ghost"
                  className="sm:col-span-2"
                  onClick={() => setAmbiguous(true)}
                  data-testid="ambiguous-consent"
                >
                  {t.maybe}
                </Button>
              </CardFooter>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <Badge variant="secondary">
                    <Languages aria-hidden="true" /> Hindi → English
                  </Badge>
                  <Badge variant="outline">
                    SHA-256 · {scenario.disclosure.aggregateHash.slice(0, 8)}
                  </Badge>
                </div>
                <CardTitle className="mt-4 text-2xl">
                  {t.caregiverSees}
                </CardTitle>
                <CardDescription>
                  {scenario.recipientEnglish} · in-app + verified demo email ·
                  24h
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div
                  className="rounded-2xl border bg-background p-5 text-base leading-8"
                  data-testid="exact-english-disclosure"
                >
                  {scenario.disclosure.caregiverDisclosure.text}
                </div>
                <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                  <code className="overflow-hidden text-ellipsis rounded bg-muted p-2">
                    HI {scenario.disclosure.elderPreview.contentHash}
                  </code>
                  <code className="overflow-hidden text-ellipsis rounded bg-muted p-2">
                    EN {scenario.disclosure.caregiverDisclosure.contentHash}
                  </code>
                </div>
                <Alert>
                  <FileCheck2 aria-hidden="true" />
                  <AlertTitle>
                    Static safety wrapper · dynamic slots only
                  </AlertTitle>
                  <AlertDescription>
                    The reviewed Hindi consent language was not
                    machine-translated. Only the fictional event summary and
                    request use deterministic translation.
                  </AlertDescription>
                </Alert>
              </CardContent>
            </Card>
          </section>
        )}

        {phase === "denied" && (
          <Card className="phase-enter mx-auto max-w-2xl border-primary/20">
            <CardContent className="grid place-items-center p-8 text-center sm:p-12">
              <div className="grid size-16 place-items-center rounded-full bg-secondary">
                <LockKeyhole
                  aria-hidden="true"
                  className="size-7 text-primary"
                />
              </div>
              <h2 className="mt-6 text-3xl">{t.deniedTitle}</h2>
              <p className="mt-3 max-w-lg leading-7 text-muted-foreground">
                {t.deniedBody}
              </p>
              <div className="mt-7 flex flex-wrap justify-center gap-3">
                <Button
                  variant="outline"
                  onClick={() => {
                    setPersona("elder");
                    move("consent");
                  }}
                >
                  <ArrowLeft aria-hidden="true" />
                  {t.restartConsent}
                </Button>
                <Button onClick={reset}>{t.another}</Button>
              </div>
            </CardContent>
          </Card>
        )}

        {phase === "review" && activeAction !== undefined && (
          <section className="phase-enter grid min-w-0 gap-6 xl:grid-cols-[0.85fr_1.15fr]">
            <div className="space-y-5">
              <Alert className="border-primary/25 bg-card p-5">
                <LockKeyhole aria-hidden="true" />
                <AlertTitle>{t.caregiver}</AlertTitle>
                <AlertDescription>{t.caregiverBody}</AlertDescription>
              </Alert>
              <Card>
                <CardHeader>
                  <Badge variant="secondary" className="mb-3">
                    Shared with consent · v{eventVersion}
                  </Badge>
                  <CardTitle className="text-2xl">
                    Consent-scoped situation
                  </CardTitle>
                </CardHeader>
                <CardContent className="leading-7">
                  {scenario.disclosure.caregiverDisclosure.text}
                </CardContent>
              </Card>
              <RadioGroup
                value={activeAction.id}
                onValueChange={setSelectedAction}
                className="gap-3"
              >
                {scenario.caregiverOptions.map((option) => (
                  <label
                    htmlFor={`action-${option.id}`}
                    key={option.id}
                    className={cn(
                      "grid cursor-pointer grid-cols-[auto_1fr] gap-3 rounded-xl border bg-card p-4",
                      activeAction.id === option.id &&
                        "border-primary ring-2 ring-primary/15",
                    )}
                  >
                    <RadioGroupItem
                      id={`action-${option.id}`}
                      value={option.id}
                      className="mt-1"
                    />
                    <span>
                      <span className="block font-medium">{option.title}</span>
                      <span className="mt-1 block text-sm leading-6 text-muted-foreground">
                        {option.effect}
                      </span>
                      <span className="mt-2 block text-xs font-medium text-primary">
                        Limitation: {option.limitation}
                      </span>
                    </span>
                  </label>
                ))}
              </RadioGroup>
            </div>

            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <Badge variant="outline">
                    <MailCheck aria-hidden="true" /> Verified demo email
                  </Badge>
                  <code className="text-xs text-muted-foreground">
                    {scenario.disclosure.providerDisclosure.contentHash.slice(
                      0,
                      16,
                    )}
                    …
                  </code>
                </div>
                <CardTitle className="mt-3 text-3xl">
                  {t.exactMessage}
                </CardTitle>
                <CardDescription>
                  Lakeview demo contact · en-US · provider replies disabled
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div
                  className="whitespace-pre-wrap rounded-2xl border bg-background p-5 text-sm leading-7"
                  data-testid="provider-message"
                >
                  {scenario.providerMessageEnglish}
                </div>
                <Separator className="my-5" />
                <dl className="grid gap-3 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-muted-foreground">Effect</dt>
                    <dd className="font-medium">{activeAction.effect}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Limitation</dt>
                    <dd className="font-medium">{activeAction.limitation}</dd>
                  </div>
                </dl>
              </CardContent>
              <CardFooter className="flex flex-wrap justify-between gap-3">
                <Button
                  variant="outline"
                  onClick={() => {
                    setPersona("elder");
                    setEventVersion((version) => version + 1);
                    toast.warning(
                      "Recipient/content edits supersede consent and approval.",
                    );
                    move("consent");
                  }}
                  data-testid="edit-scope"
                >
                  <PencilLine aria-hidden="true" />
                  {t.edit}
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button data-testid="approve-action">
                      <ShieldCheck aria-hidden="true" />
                      {t.approve}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogMedia>
                        <ShieldCheck aria-hidden="true" />
                      </AlertDialogMedia>
                      <AlertDialogTitle>{t.approveTitle}</AlertDialogTitle>
                      <AlertDialogDescription>
                        {t.approveBody}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => move("approved")}
                        data-testid="confirm-approval"
                      >
                        Approve exact version
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </CardFooter>
            </Card>
          </section>
        )}

        {phase === "approved" && (
          <Card className="phase-enter mx-auto max-w-3xl">
            <CardContent className="p-7 sm:p-10">
              <div className="flex gap-4">
                <div className="grid size-12 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
                  <Check aria-hidden="true" />
                </div>
                <div>
                  <h2 className="text-3xl">{t.approved}</h2>
                  <p className="mt-2 text-muted-foreground">
                    Action v1 · payload{" "}
                    {scenario.disclosure.providerDisclosure.contentHash.slice(
                      0,
                      16,
                    )}
                    … · expires in 24h
                  </p>
                </div>
              </div>
              <Separator className="my-7" />
              <ul className="grid gap-3 text-sm sm:grid-cols-2">
                {[
                  "Active caregiver membership",
                  "Latest event and action versions",
                  "Exact consent and approval hashes",
                  "Verified seeded destination",
                  "Global and circle switches",
                  "No prohibited envelope keys",
                ].map((rule) => (
                  <li key={rule} className="flex gap-2">
                    <CheckCircle2
                      aria-hidden="true"
                      className="mt-0.5 size-4 shrink-0 text-primary"
                    />
                    {rule}
                  </li>
                ))}
              </ul>
              <div className="mt-8 flex flex-wrap gap-3">
                <Button
                  size="lg"
                  onClick={() => move("validated")}
                  data-testid="validate-policy"
                >
                  <ShieldCheck aria-hidden="true" />
                  {t.validate}
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  onClick={revokeBeforeDelivery}
                  data-testid="revoke-consent"
                >
                  <X aria-hidden="true" />
                  Revoke consent
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {phase === "validated" && (
          <Card className="phase-enter mx-auto max-w-3xl border-primary/25">
            <CardContent className="p-7 sm:p-10">
              <Badge className="mb-5">
                <CheckCircle2 aria-hidden="true" /> PASS ·
                cable-policy-2026-07-24.1
              </Badge>
              <h2 className="text-3xl">{t.validated}</h2>
              <p className="mt-3 leading-7 text-muted-foreground">
                Five-minute TTL · networkBlockAll · no credentials · opaque IDs
                only · authoritative gate repeated before send.
              </p>
              <div className="mt-6 rounded-xl bg-muted p-4 font-mono text-xs leading-6">
                validatorHash: 87e8d1a4…
                <br />
                payloadHash:{" "}
                {scenario.disclosure.providerDisclosure.contentHash.slice(
                  0,
                  20,
                )}
                …<br />
                failures: []
              </div>
              <div className="mt-7 flex flex-wrap gap-3">
                <Button
                  size="lg"
                  onClick={() => move("delivered")}
                  data-testid="queue-delivery"
                >
                  <MailCheck aria-hidden="true" />
                  {t.send}
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  onClick={revokeBeforeDelivery}
                  data-testid="revoke-consent"
                >
                  <X aria-hidden="true" />
                  Revoke consent
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {phase === "delivered" && (
          <section className="phase-enter grid min-w-0 gap-6 lg:grid-cols-[0.9fr_1.1fr]">
            <Card className="border-primary/25 bg-primary text-primary-foreground">
              <CardContent className="p-8 sm:p-10">
                <div className="grid size-16 place-items-center rounded-full bg-white/15">
                  <MailCheck aria-hidden="true" className="size-8" />
                </div>
                <h2 className="mt-7 text-4xl text-primary-foreground">
                  {t.delivered}
                </h2>
                <p className="mt-4 leading-8 text-primary-foreground/80">
                  {t.deliveredBody}
                </p>
                <p className="mt-6 font-mono text-xs text-primary-foreground/70">
                  synthetic_
                  {scenario.disclosure.providerDisclosure.contentHash.slice(
                    0,
                    20,
                  )}
                </p>
                <Button
                  variant="secondary"
                  size="lg"
                  className="mt-8"
                  onClick={reset}
                >
                  <RotateCcw aria-hidden="true" />
                  {t.another}
                </Button>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-3xl">Activity</CardTitle>
                <CardDescription>
                  Redacted, append-only synthetic audit timeline
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ol className="relative space-y-0 border-l border-border pl-6">
                  {[
                    ["Facts confirmed", `Event version ${eventVersion}`],
                    [
                      "Consent granted",
                      "Hindi preview + English disclosure hashes",
                    ],
                    ["Action approved", "Exact immutable provider payload"],
                    ["Policy passed", "Credential-free isolated validator"],
                    ["Message accepted", "Deterministic adapter; no network"],
                  ].map(([label, detail], index) => (
                    <li key={label} className="relative pb-7 last:pb-0">
                      <span className="absolute -left-[1.9rem] top-0.5 grid size-4 place-items-center rounded-full bg-primary ring-4 ring-background">
                        <Check
                          aria-hidden="true"
                          className="size-2.5 text-primary-foreground"
                        />
                      </span>
                      <p className="font-medium">{label}</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {detail}
                      </p>
                      <time className="mt-1 block text-xs text-muted-foreground">
                        Step {index + 1}
                      </time>
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          </section>
        )}
      </main>
    </div>
  );
}
