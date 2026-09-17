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
    const labels = CLARIFY_LABELS[result.language] ?? CLARIFY_LABELS.en;
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

  const actions: ChatMapAction[] = [];

  const hasMapTarget = Boolean(
    result.route ||
      (result.zones && result.zones.length > 0) ||
      (result.alerts && result.alerts.length > 0) ||
      result.affectedArea
  );

  if (hasMapTarget) {
    const label = result.route
      ? "View route"
      : result.zones && result.zones.length > 0
        ? "View zone"
        : "View on map";

    actions.push({ label, onClick: handlers.onView });
  }

  // Only offer to simulate when there's a real risk baseline to compare
  // against and this answer isn't already a what-if comparison itself.
  const canSimulate =
    !result.whatIf &&
    typeof result.riskScore === "number" &&
    (result.intent === "safety" || result.intent === "route");

  if (canSimulate) {
    actions.push({ label: "Simulate (what if?)", onClick: handlers.onSimulate });
  }

  return actions.slice(0, 2);
}

function buildStructuredData(
  result: SagarChatResponse,
  handlers: {
    onView: () => void;
    onSimulate: () => void;
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

  const currentLocation = useAppStore(
    (state) => state.currentLocation
  );

  const selectedAreaId = useAppStore(
    (state) => state.selectedAreaId
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

      const handleSimulate = () => {
        void sendMessageRef.current?.(
          "What if wind speed increases by 20%?",
          options
        );
      };

      try {
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
            onSimulate: handleSimulate,
            onUseMyLocation: handlersRef.current.onUseMyLocation,
            onChooseArea: handlersRef.current.onChooseArea,
          }),
          language: result.language,
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
          zones: local.zones as unknown as RankedFishingZone[] | undefined,
          alerts: undefined,
          affectedAreaId: local.areaId,
          intent: local.intent,
        };
      }
    },
    [
      currentLocation?.latitude,
      currentLocation?.longitude,
      navigate,
      selectedAreaId,
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

        setError(
          "Sagar could not process the request."
        );

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
