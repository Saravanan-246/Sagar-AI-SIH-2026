import { useCallback, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  askSagarBackend,
  type RankedFishingZone,
  type SagarChatResponse,
} from "../services/api/sagarApiClient";
import type { Alert } from "../types/alert";
import { askSagar as askSagarLocal } from "../services/ai/localSagar";
import { getOfflineSnapshot } from "../services/offline/offlineSnapshot";
import { describeSnapshotAge } from "./useOfflineSync";
import { useAppStore } from "../store/appStore";
import { ROUTES } from "../constants/routes";
import {
  detectLanguageWithMetadata,
  pinnedLanguageContext,
  resolveLanguageContext,
} from "../services/ai/languageDetector";
import { isChatLanguage } from "../utils/voiceLocale";
import {
  buildConversationalReply,
  detectConversationalIntent,
} from "../services/ai/conversationalIntent";
import type { ChatLanguageStyle, LanguageContext } from "../types/chat";

import type {
  ChatMapAction,
  ChatStructuredData,
} from "../components/chat/ChatStructuredPanel";
import type { RoutePlan } from "../types/route";

type SagarChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  timestamp: string;
  route?: RoutePlan | null;
  structured?: ChatStructuredData;
  /** The language Sagar actually answered in (from the backend's detected
   * language), so voice playback can match the reply instead of a static
   * app-wide setting. */
  language?: string;
  /** Full language decision (language + style + locale) the reply was
   * written in - voice output speaks with it. */
  languageContext?: LanguageContext;
  /** "Can you speak Tamil?" -> "ta", so voice input can listen for it. */
  requestedLanguage?: string;
  /** Raw backend fields kept (beyond the trimmed ChatStructuredData) so
   * the contextual map panel can resolve real coordinates - zone/alert
   * locations and the resolved area id - without re-parsing chat text. */
  zones?: RankedFishingZone[];
  alerts?: Alert[];
  affectedAreaId?: string;
  intent?: string;
};

type SagarOptions = {
  language?: string;
  areaId?: string;
  /** Configured route in view (Home / Route page) - the backend uses it
   * only when the question is about a route. */
  routeId?: string;
  /** Pins the reply language for a follow-up sent on the user's behalf. */
  replyLanguage?: string;
  replyStyle?: ChatLanguageStyle;
};

type UiLanguage = "en" | "ta" | "hi";

/** Chrome text (chips, errors) follows the reply: Tamil/Hindi script
 * replies get Tamil/Hindi labels; English and romanised
 * (Tanglish/Hinglish) conversations keep English labels. */
function uiLanguageFor(
  language?: string,
  style?: ChatLanguageStyle
): UiLanguage {
  const romanised = style === "tanglish" || style === "hinglish" || style === "romanized";
  if (!romanised && (language === "ta" || language === "hi")) return language;
  return "en";
}

const ACTION_LABELS: Record<
  UiLanguage,
  {
    viewRoute: string;
    viewZone: string;
    viewMap: string;
    simulate: string;
    why: string;
    whatData: string;
    openDecisions: string;
  }
> = {
  en: {
    viewRoute: "View route",
    viewZone: "View zone",
    viewMap: "View on map",
    simulate: "Simulate (what if?)",
    why: "Why this?",
    whatData: "What data?",
    openDecisions: "Open decisions",
  },
  ta: {
    viewRoute: "பாதையைக் காண்",
    viewZone: "மண்டலத்தைக் காண்",
    viewMap: "வரைபடத்தில் காண்",
    simulate: "What-if பார்",
    why: "ஏன்?",
    whatData: "என்ன தரவு?",
    openDecisions: "Decisions திற",
  },
  hi: {
    viewRoute: "मार्ग देखें",
    viewZone: "क्षेत्र देखें",
    viewMap: "नक्शे पर देखें",
    simulate: "What-if देखें",
    why: "क्यों?",
    whatData: "कौन सा डेटा?",
    openDecisions: "Decisions खोलें",
  },
};

const CHAT_ERROR: Record<UiLanguage, string> = {
  en: "Connection to Sagar is unavailable. Please try again.",
  ta: "Sagar-உடன் இணைப்பு கிடைக்கவில்லை. மீண்டும் முயற்சிக்கவும்.",
  hi: "Sagar से कनेक्शन उपलब्ध नहीं है। कृपया फिर से कोशिश करें।",
};

/**
 * Handlers the Chat page supplies so a clarification answer can offer
 * its action inline. They reuse the page's existing location controls
 * (browser geolocation + the area picker) rather than introducing a
 * second location system.
 */
type SagarHandlers = {
  onUseMyLocation?: () => void;
  onChooseArea?: () => void;
  /** Reports whether the real backend request this turn actually
   * succeeded - the connectivity hook uses this (alongside
   * navigator.onLine) so "the backend is unreachable even though the
   * device says it's online" is detected from a real request outcome,
   * not just the browser's network-interface flag. */
  onConnectivityChange?: (succeeded: boolean) => void;
};

/*
 * Chip labels follow the language Sagar actually answered in, so a
 * Tamil clarification gets Tamil actions. Deterministic templates - no
 * LLM call - so the chips appear instantly with the message.
 */
const CLARIFY_LABELS: Record<
  string,
  { useLocation: string; chooseArea: string }
> = {
  en: { useLocation: "Use my location", chooseArea: "Choose area" },
  ta: {
    useLocation: "என் இருப்பிடத்தைப் பயன்படுத்து",
    chooseArea: "பகுதியைத் தேர்ந்தெடு",
  },
  hi: { useLocation: "मेरा स्थान उपयोग करें", chooseArea: "क्षेत्र चुनें" },
};

type UseSagarReturn = {
  messages: SagarChatMessage[];
  loading: boolean;
  error: string | null;
  sendMessage: (
    message: string,
    options?: SagarOptions
  ) => Promise<SagarChatMessage | null>;
  clearConversation: () => void;
  restoreMessages: (messages: SagarChatMessage[]) => void;
  /** Re-asks the last user question, e.g. once a location is chosen. */
  retryLastQuestion: () => void;
  /** Supported area the backend resolved for the last answer, if any. */
  resolvedAreaName: string | null;
};

interface AssistantReply {
  text: string;
  route: RoutePlan | null;
  structured?: ChatStructuredData;
  language?: string;
  languageContext?: LanguageContext;
  requestedLanguage?: string;
  zones?: RankedFishingZone[];
  alerts?: Alert[];
  affectedAreaId?: string;
  intent?: string;
}

/**
 * A small, result-relevant action set - never every possible action.
 * Map/route/zone navigation reuses the existing map handoff; "Simulate"
 * reuses the existing deterministic what-if pipeline by asking a real
 * follow-up question through the same Chat pipeline (no new engine).
 */
function buildStructuredActions(
  result: SagarChatResponse,
  handlers: {
    onView: () => void;
    onSimulate: () => void;
    onWhy: () => void;
    onWhatData: () => void;
    onOpenDecisions: () => void;
    onUseMyLocation?: () => void;
    onChooseArea?: () => void;
  }
): ChatMapAction[] {
  /*
   * A clarification answer has no result to act on yet - what it needs
   * is the missing piece of context, offered right there in the
   * conversation. "Outside coverage" deliberately omits "use my
   * location": retrying the same coordinates would fail the same way.
   */
  if (result.needs) {
    const labels =
      CLARIFY_LABELS[uiLanguageFor(result.language, result.languageContext?.style)] ??
      CLARIFY_LABELS.en;
    const clarifyActions: ChatMapAction[] = [];

    if (result.needs.kind !== "location_out_of_coverage" && handlers.onUseMyLocation) {
      clarifyActions.push({
        label: labels.useLocation,
        onClick: handlers.onUseMyLocation,
      });
    }

    if (handlers.onChooseArea) {
      clarifyActions.push({
        label: labels.chooseArea,
        onClick: handlers.onChooseArea,
      });
    }

    return clarifyActions;
  }

  const actionLabels =
    ACTION_LABELS[uiLanguageFor(result.language, result.languageContext?.style)];

  // A decision-status answer points to where the decision lives.
  if (result.intent === "decision") {
    return [{ label: actionLabels.openDecisions, onClick: handlers.onOpenDecisions }];
  }

  const actions: ChatMapAction[] = [];

  const hasMapTarget = Boolean(
    result.route ||
      (result.zones && result.zones.length > 0) ||
      (result.alerts && result.alerts.length > 0) ||
      result.affectedArea
  );

  if (hasMapTarget) {
    const label = result.route
      ? actionLabels.viewRoute
      : result.zones && result.zones.length > 0
        ? actionLabels.viewZone
        : actionLabels.viewMap;

    actions.push({ label, onClick: handlers.onView });
  }

  // Only offer to simulate when there's a real risk baseline to compare
  // against and this answer isn't already a what-if comparison itself.
  const canSimulate =
    !result.whatIf &&
    typeof result.riskScore === "number" &&
    (result.intent === "safety" || result.intent === "route");

  if (canSimulate) {
    actions.push({ label: actionLabels.simulate, onClick: handlers.onSimulate });
  }

  // "Why this?" / "What data?" only make sense when there's a real
  // decision (a risk score, or a zone/alert list) to explain, and never
  // on a what-if comparison or an evidence answer explaining itself.
  const hasExplainableBasis =
    !result.whatIf &&
    result.intent !== "evidence" &&
    (typeof result.riskScore === "number" ||
      (result.zones && result.zones.length > 0) ||
      (result.alerts && result.alerts.length > 0));

  if (hasExplainableBasis) {
    actions.push({ label: actionLabels.why, onClick: handlers.onWhy });
    actions.push({ label: actionLabels.whatData, onClick: handlers.onWhatData });
  }

  return actions.slice(0, 4);
}

function buildStructuredData(
  result: SagarChatResponse,
  handlers: {
    onView: () => void;
    onSimulate: () => void;
    onWhy: () => void;
    onWhatData: () => void;
    onOpenDecisions: () => void;
    onUseMyLocation?: () => void;
    onChooseArea?: () => void;
  }
): ChatStructuredData | undefined {
  const actions = buildStructuredActions(result, handlers);

  // A zone recommendation list already conveys per-zone suitability -
  // a generic area-wide risk score alongside it reads as contradicting
  // that, so PFZ/zone answers never show the top-level score.
  const hasZones = Boolean(result.zones && result.zones.length > 0);

  const structured: ChatStructuredData = {
    riskLevel: hasZones ? undefined : result.riskLevel,
    riskScore: hasZones ? undefined : result.riskScore,
    keyFactors: result.keyFactors,
    evidenceTitles: result.evidence?.map((item) => item.title),
    whatIfSummary: result.whatIf
      ? `What if ${result.whatIf.question}? ${result.whatIf.impact}`
      : undefined,
    whatIfComparison: result.whatIf
      ? {
          question: result.whatIf.question,
          before: result.whatIf.before,
          after: result.whatIf.after,
          impact: result.whatIf.impact,
          recommendation: result.whatIf.recommendation,
        }
      : undefined,
    zones: hasZones
      ? result.zones!.slice(0, 3).map((zone) => ({
          name: zone.name,
          recommendation: zone.recommendation,
          suitability: zone.suitability,
          reasons: zone.reasons,
        }))
      : undefined,
    route: result.route
      ? {
          distanceKm: result.route.distanceKm,
          durationHours: result.route.estimatedDurationHours,
          riskLevel: result.route.risk?.level,
          riskScore: result.route.risk?.score,
          status: result.route.status,
        }
      : undefined,
    actions: actions.length > 0 ? actions : undefined,
    verifiedSource: result.dataStatus?.verifiedSources?.[0]
      ? {
          name: result.dataStatus.verifiedSources[0].name,
          age: result.dataStatus.verifiedSources[0].age,
          freshness: result.dataStatus.verifiedSources[0].freshness,
          distanceFromAreaKm:
            result.dataStatus.verifiedSources[0].distanceFromAreaKm,
        }
      : undefined,
  };

  const hasAnyField = Object.values(structured).some(
    (value) => value !== undefined && !(Array.isArray(value) && value.length === 0)
  );

  return hasAnyField ? structured : undefined;
}

export default function useSagar(
  handlers: SagarHandlers = {}
): UseSagarReturn {
  const [messages, setMessages] = useState<SagarChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const navigate = useNavigate();

  const setPendingRoute = useAppStore(
    (state) => state.setPendingRoute
  );

  const setPendingMapFocus = useAppStore(
    (state) => state.setPendingMapFocus
  );

  // Lets a structured action (e.g. "Simulate") ask a real follow-up
  // question through this same hook's own sendMessage, without a
  // circular dependency between the two useCallbacks below.
  const sendMessageRef = useRef<UseSagarReturn["sendMessage"] | null>(null);

  // The last question the user actually asked, so a clarification chip
  // can re-ask it once the missing context is supplied.
  const lastUserMessageRef = useRef<string | null>(null);

  const [resolvedAreaName, setResolvedAreaName] = useState<string | null>(
    null
  );

  // Held in a ref so changing page-level handlers never re-creates the
  // send pipeline mid-conversation.
  const handlersRef = useRef<SagarHandlers>(handlers);
  handlersRef.current = handlers;

  const resolveAssistantReply = useCallback(
    async (
      text: string,
      options: SagarOptions,
      history: SagarChatMessage[]
    ): Promise<AssistantReply> => {
      const handleViewOnMap = (result: SagarChatResponse) => () => {
        if (result.route) {
          setPendingRoute(result.route);
          navigate(ROUTES.ROUTE);
          return;
        }

        setPendingMapFocus({
          areaId: result.affectedArea?.id,
          label: result.affectedArea?.name,
        });
        navigate(ROUTES.MAP);
      };

      /*
       * Follow-up chips ask a real question through this same pipeline -
       * the backend's deterministic what-if/evidence intents answer each
       * from data already computed for this area, no new engine. The
       * question text is English (what those intents recognise), so the
       * reply language is pinned to the conversation's, keeping a Tamil
       * conversation in Tamil.
       */
      const followUp = (result: SagarChatResponse, question: string) => () => {
        void sendMessageRef.current?.(question, {
          ...options,
          replyLanguage: result.languageContext?.language ?? result.language,
          replyStyle: result.languageContext?.style,
        });
      };

      const handleOpenDecisions = () => navigate(ROUTES.DECISIONS);

      try {
        // Read at request time, not from this render's closure: a
        // clarification retry is sent right after an area is picked,
        // before React re-renders, so a captured value would still be
        // the old empty one and Sagar would ask for the area again.
        const { selectedAreaId, currentLocation } = useAppStore.getState();

        const result = await askSagarBackend(text, {
          language: options.language,
          areaId: options.areaId ?? selectedAreaId ?? undefined,
          latitude: options.areaId
            ? undefined
            : currentLocation?.latitude,
          longitude: options.areaId
            ? undefined
            : currentLocation?.longitude,
          history: history.slice(-6).map((message) => ({
            role: message.role,
            text: message.text,
          })),
          routeId: options.routeId,
          replyLanguage: options.replyLanguage,
          replyStyle: options.replyStyle,
        });

        handlersRef.current.onConnectivityChange?.(true);

        // Only the resolved supported area is kept - never the raw
        // coordinates that produced it.
        setResolvedAreaName(result.affectedArea?.name ?? null);

        const base =
          result.answer ||
          result.recommendation ||
          (result.warnings && result.warnings.length > 0
            ? result.warnings.join(" ")
            : "Sagar could not generate a response for this request.");

        return {
          text: base,
          route: result.route ?? null,
          structured: buildStructuredData(result, {
            onView: handleViewOnMap(result),
            onSimulate: followUp(result, "What if wind speed increases by 20%?"),
            onWhy: followUp(result, "Why is this area risky?"),
            onWhatData: followUp(result, "What data are you using for this decision?"),
            onOpenDecisions: handleOpenDecisions,
            onUseMyLocation: handlersRef.current.onUseMyLocation,
            onChooseArea: handlersRef.current.onChooseArea,
          }),
          language: result.language,
          languageContext: result.languageContext,
          requestedLanguage: result.requestedLanguage,
          zones: result.zones,
          alerts: result.alerts,
          affectedAreaId: result.affectedArea?.id,
          intent: result.intent,
        };
      } catch (backendError) {
        handlersRef.current.onConnectivityChange?.(false);

        console.warn(
          "Sagar backend is unavailable, using the offline responder:",
          backendError
        );

        const userTurns = history
          .filter((message) => message.role === "user")
          .map((message) => message.text);

        // Greetings, thanks and "Can you speak Tamil?" need no marine
        // data, so they are answered the same way offline.
        const conversational = detectConversationalIntent(text);
        if (conversational) {
          const userContext = resolveLanguageContext(text, userTurns);
          const reply = buildConversationalReply(conversational, userContext, userTurns.length);
          // "Say something in Tamil" is answered (and spoken) in Tamil.
          const languageContext = reply.replyLanguage
            ? pinnedLanguageContext(reply.replyLanguage.language, reply.replyLanguage.style)
            : userContext;
          return {
            text: reply.answer,
            route: null,
            language: languageContext.language,
            languageContext,
            requestedLanguage: reply.requestedLanguage,
            intent: conversational.intent,
          };
        }

        const local = await askSagarLocal(text, {
          language: options.language,
          areaId: options.areaId,
        });

        const snapshot = getOfflineSnapshot();
        const lastSyncedAge = snapshot
          ? describeSnapshotAge(snapshot.createdAt)
          : undefined;

        const snapshotAgeMs = snapshot
          ? Date.now() - Date.parse(snapshot.createdAt)
          : null;

        // A simple, disclosed offline confidence rule (Part 4 report
        // has the full rationale): local data is always at most MEDIUM
        // confidence, downgraded to LOW once the last sync is old
        // enough that marine conditions have likely moved on - never
        // upgraded to HIGH, since no live source backs the offline path.
        const offlineConfidence: "MEDIUM" | "LOW" =
          snapshotAgeMs !== null && snapshotAgeMs > 6 * 60 * 60 * 1000
            ? "LOW"
            : "MEDIUM";

        const offlineExplanation = snapshot
          ? offlineConfidence === "LOW"
            ? `Synced data is from ${lastSyncedAge} - more than 6 hours old, so confidence is reduced.`
            : `Using marine data synced ${lastSyncedAge} and Sagar's local decision engine.`
          : "No previous sync found - using Sagar's bundled prototype dataset and local decision engine.";

        const structured: ChatStructuredData = {
          riskLevel: local.zones ? undefined : local.riskLevel,
          riskScore: local.zones ? undefined : local.riskScore,
          keyFactors: local.keyFactors,
          evidenceTitles: local.evidence.map((item) => item.title),
          zones: local.zones?.map((zone) => ({
            name: zone.name,
            recommendation: zone.recommendation,
            suitability: zone.suitability,
            reasons: zone.reasons,
          })),
          route: local.route
            ? {
                distanceKm: local.route.distanceKm,
                durationHours: local.route.estimatedDurationHours,
                riskLevel: local.route.risk?.level,
                riskScore: local.route.risk?.score,
                status: local.route.status,
              }
            : undefined,
          whatIfComparison: local.whatIf
            ? {
                question: local.whatIf.question,
                before: local.whatIf.before,
                after: local.whatIf.after,
                impact: local.whatIf.impact,
                recommendation: local.whatIf.recommendation,
              }
            : undefined,
          offlineStatus: {
            lastSyncedAge,
            confidence: offlineConfidence,
            explanation: offlineExplanation,
          },
        };

        return {
          text: local.text,
          route: local.route ?? null,
          structured,
          language: local.language,
          // Same detector the backend uses, so the offline reply is
          // spoken with the same language/style rules.
          languageContext: resolveLanguageContext(
            text,
            userTurns,
            isChatLanguage(local.language) ? local.language : "en",
          ),
          zones: local.zones as unknown as RankedFishingZone[] | undefined,
          alerts: undefined,
          affectedAreaId: local.areaId,
          intent: local.intent,
        };
      }
    },
    [
      navigate,
      setPendingMapFocus,
      setPendingRoute,
    ]
  );

  const sendMessage = useCallback(
    async (
      message: string,
      options: SagarOptions = {}
    ) => {
      const text = message.trim();

      if (!text || loading) {
        return null;
      }

      setError(null);

      const userMessage: SagarChatMessage = {
        id: `user-${Date.now()}`,
        role: "user",
        text,
        timestamp: new Date().toISOString(),
      };

      lastUserMessageRef.current = text;

      const historySnapshot = [...messages, userMessage];

      setMessages((current) => [
        ...current,
        userMessage,
      ]);

      setLoading(true);

      try {
        const reply = await resolveAssistantReply(
          text,
          options,
          historySnapshot
        );

        const assistantMessage: SagarChatMessage = {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          text: reply.text,
          timestamp: new Date().toISOString(),
          route: reply.route,
          structured: reply.structured,
          language: reply.language,
          languageContext: reply.languageContext,
          requestedLanguage: reply.requestedLanguage,
          zones: reply.zones,
          alerts: reply.alerts,
          affectedAreaId: reply.affectedAreaId,
          intent: reply.intent,
        };

        setMessages((current) => [
          ...current,
          assistantMessage,
        ]);

        return assistantMessage;
      } catch (err) {
        console.error(
          "Sagar request failed:",
          err
        );

        // Plain, localised wording - never the raw error, a stack trace
        // or provider details.
        const detected = detectLanguageWithMetadata(text);
        setError(CHAT_ERROR[uiLanguageFor(detected.language, detected.style)]);

        return null;
      } finally {
        setLoading(false);
      }
    },
    [loading, messages, resolveAssistantReply]
  );

  sendMessageRef.current = sendMessage;

  /*
   * Re-asks the question the clarification was about, now that the
   * missing context (location or area) has been supplied - so the user
   * never has to retype it. The store already holds the new location,
   * which sendMessage reads on its own.
   */
  const retryLastQuestion = useCallback(() => {
    const question = lastUserMessageRef.current;

    if (question) {
      void sendMessageRef.current?.(question);
    }
  }, []);

  const clearConversation = useCallback(() => {
    setMessages([]);
    setError(null);
    setResolvedAreaName(null);
    lastUserMessageRef.current = null;
  }, []);

  const restoreMessages = useCallback(
    (restored: SagarChatMessage[]) => {
      setMessages(restored);
      setError(null);
    },
    []
  );

  return {
    messages,
    loading,
    error,
    sendMessage,
    clearConversation,
    restoreMessages,
    retryLastQuestion,
    resolvedAreaName,
  };
}
