import type {
  ChatContext,
  ChatMessage,
  ChatLanguage,
  ChatIntent,
} from "../../types/chat";

const MAX_CONTEXT_MESSAGES = 12;

export interface ConversationState {
  messages: ChatMessage[];

  context: ChatContext;

  language: ChatLanguage;

  intent: ChatIntent;

  areaId?: string;

  areaName?: string;
}

function normalizeText(
  value: string | undefined
): string {
  return (value ?? "")
    .trim()
    .toLowerCase();
}

function getLatestMessage(
  messages: ChatMessage[],
  role: ChatMessage["role"]
): ChatMessage | undefined {
  for (
    let index = messages.length - 1;
    index >= 0;
    index -= 1
  ) {
    if (messages[index].role === role) {
      return messages[index];
    }
  }

  return undefined;
}

function getLatestIntent(
  messages: ChatMessage[]
): ChatIntent | undefined {
  const latest = getLatestMessage(
    messages,
    "user"
  );

  return latest?.intent;
}

function getLatestLanguage(
  messages: ChatMessage[]
): ChatLanguage | undefined {
  const latest = getLatestMessage(
    messages,
    "user"
  );

  return latest?.language;
}

function detectAreaFromMessages(
  messages: ChatMessage[]
): {
  areaId?: string;
  areaName?: string;
} {
  for (
    let index = messages.length - 1;
    index >= 0;
    index -= 1
  ) {
    const message = messages[index];

    if (
      message.context?.areaId ||
      message.context?.areaName
    ) {
      return {
        areaId:
          message.context.areaId,

        areaName:
          message.context.areaName,
      };
    }
  }

  return {};
}

function mergeContext(
  base: ChatContext,
  incoming: ChatContext
): ChatContext {
  return {
    ...base,
    ...incoming,

    areaId:
      incoming.areaId ??
      base.areaId,

    areaName:
      incoming.areaName ??
      base.areaName,

    language:
      incoming.language ??
      base.language,

    intent:
      incoming.intent ??
      base.intent,

    coordinates:
      incoming.coordinates ??
      base.coordinates,

    lastUserMessage:
      incoming.lastUserMessage ??
      base.lastUserMessage,

    lastAssistantMessage:
      incoming.lastAssistantMessage ??
      base.lastAssistantMessage,

    metadata: {
      ...(base.metadata ?? {}),
      ...(incoming.metadata ?? {}),
    },
  };
}

export function createInitialContext(
  options: {
    language?: ChatLanguage;
    intent?: ChatIntent;
    areaId?: string;
    areaName?: string;
    coordinates?: {
      latitude: number;
      longitude: number;
    };
  } = {}
): ChatContext {
  return {
    language:
      options.language ?? "en",

    intent:
      options.intent ?? "general",

    areaId:
      options.areaId,

    areaName:
      options.areaName,

    coordinates:
      options.coordinates,

    metadata: {},
  };
}

export function buildConversationState(
  messages: ChatMessage[],
  initialContext?: ChatContext
): ConversationState {
  const recentMessages =
    messages.slice(
      -MAX_CONTEXT_MESSAGES
    );

  const latestUser =
    getLatestMessage(
      recentMessages,
      "user"
    );

  const latestAssistant =
    getLatestMessage(
      recentMessages,
      "assistant"
    );

  const detectedArea =
    detectAreaFromMessages(
      recentMessages
    );

  const context =
    recentMessages.reduce(
      (current, message) =>
        mergeContext(
          current,
          message.context ?? {}
        ),
      initialContext ??
        createInitialContext()
    );

  const language =
    getLatestLanguage(
      recentMessages
    ) ??
    context.language ??
    "en";

  const intent =
    getLatestIntent(
      recentMessages
    ) ??
    context.intent ??
    "general";

  return {
    messages:
      recentMessages,

    context: {
      ...context,

      language,

      intent,

      areaId:
        context.areaId ??
        detectedArea.areaId,

      areaName:
        context.areaName ??
        detectedArea.areaName,

      lastUserMessage:
        latestUser?.content ??
        context.lastUserMessage,

      lastAssistantMessage:
        latestAssistant?.content ??
        context.lastAssistantMessage,
    },

    language,

    intent,

    areaId:
      context.areaId ??
      detectedArea.areaId,

    areaName:
      context.areaName ??
      detectedArea.areaName,
  };
}

export function addMessageToContext(
  state: ConversationState,
  message: ChatMessage
): ConversationState {
  const messages = [
    ...state.messages,
    message,
  ].slice(-MAX_CONTEXT_MESSAGES);

  const updatedContext =
    mergeContext(
      state.context,
      message.context ?? {}
    );

  if (message.role === "user") {
    updatedContext.lastUserMessage =
      message.content;

    if (message.language) {
      updatedContext.language =
        message.language;
    }

    if (message.intent) {
      updatedContext.intent =
        message.intent;
    }
  }

  if (message.role === "assistant") {
    updatedContext.lastAssistantMessage =
      message.content;
  }

  return buildConversationState(
    messages,
    updatedContext
  );
}

export function getConversationMessages(
  state: ConversationState
): ChatMessage[] {
  return state.messages;
}

export function getConversationContext(
  state: ConversationState
): ChatContext {
  return state.context;
}

export function getLastUserMessage(
  state: ConversationState
): ChatMessage | undefined {
  return getLatestMessage(
    state.messages,
    "user"
  );
}

export function getLastAssistantMessage(
  state: ConversationState
): ChatMessage | undefined {
  return getLatestMessage(
    state.messages,
    "assistant"
  );
}

export function getPreviousIntent(
  state: ConversationState
): ChatIntent {
  return (
    state.context.intent ??
    "general"
  );
}

export function getConversationLanguage(
  state: ConversationState
): ChatLanguage {
  return (
    state.context.language ??
    "en"
  );
}

export function getConversationArea(
  state: ConversationState
): {
  areaId?: string;
  areaName?: string;
} {
  return {
    areaId:
      state.context.areaId,
    areaName:
      state.context.areaName,
  };
}

export function updateConversationContext(
  state: ConversationState,
  context: ChatContext
): ConversationState {
  const merged =
    mergeContext(
      state.context,
      context
    );

  return buildConversationState(
    state.messages,
    merged
  );
}

export function clearConversationContext(
  options: {
    language?: ChatLanguage;
    areaId?: string;
    areaName?: string;
  } = {}
): ConversationState {
  const context =
    createInitialContext({
      language:
        options.language,

      areaId:
        options.areaId,

      areaName:
        options.areaName,
    });

  return {
    messages: [],

    context,

    language:
      context.language ?? "en",

    intent: "general",

    areaId:
      context.areaId,

    areaName:
      context.areaName,
  };
}

export function buildFollowUpContext(
  state: ConversationState,
  message: string
): ChatContext {
  return {
    ...state.context,

    lastUserMessage:
      message,

    /*
     * Preserve the previous area and language
     * unless the next interaction explicitly
     * changes them.
     */
    language:
      state.language,

    intent:
      state.intent,

    areaId:
      state.areaId,

    areaName:
      state.areaName,
  };
}

export function isFollowUpQuestion(
  message: string
): boolean {
  const text =
    normalizeText(message);

  if (!text) {
    return false;
  }

  const followUpPatterns = [
    "what about",
    "how about",
    "and tomorrow",
    "what then",
    "that route",
    "this route",
    "that area",
    "this area",
    "there",
    "same area",
    "same route",
    "can i go",
    "should i go",
    "is it safe",
    "what if",
    "then",
    "also",
    "and",
  ];

  return followUpPatterns.some(
    (pattern) =>
      text === pattern ||
      text.startsWith(
        `${pattern} `
      ) ||
      text.includes(
        ` ${pattern} `
      )
  );
}

export function resolveFollowUp(
  state: ConversationState,
  message: string
): ChatContext {
  if (
    !isFollowUpQuestion(
      message
    )
  ) {
    return {
      ...state.context,

      lastUserMessage:
        message,
    };
  }

  /*
   * For follow-up questions, preserve the
   * active conversational context.
   */
  return buildFollowUpContext(
    state,
    message
  );
}

export function getContextualPrompt(
  state: ConversationState,
  message: string
): string {
  const context =
    resolveFollowUp(
      state,
      message
    );

  const parts: string[] = [];

  if (context.areaName) {
    parts.push(
      `Current area: ${context.areaName}`
    );
  }

  if (context.areaId) {
    parts.push(
      `Area ID: ${context.areaId}`
    );
  }

  if (context.intent) {
    parts.push(
      `Previous intent: ${context.intent}`
    );
  }

  if (context.language) {
    parts.push(
      `Conversation language: ${context.language}`
    );
  }

  if (
    context.lastUserMessage
  ) {
    parts.push(
      `Previous user message: ${context.lastUserMessage}`
    );
  }

  if (
    context.lastAssistantMessage
  ) {
    parts.push(
      `Previous Sagar response: ${context.lastAssistantMessage}`
    );
  }

  parts.push(
    `Current user message: ${message}`
  );

  return parts.join("\n");
}

export default buildConversationState;