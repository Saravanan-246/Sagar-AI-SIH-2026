import { useMemo, useState, type ComponentType } from "react";
import { Link, NavLink } from "react-router-dom";
import {
  AlertTriangle,
  Compass,
  Home,
  Map as MapIcon,
  MessagesSquare,
  Plus,
  Route as RouteIcon,
  Search,
  Settings,
  Sparkles,
  Trash2,
  Waves,
  X,
} from "lucide-react";

import type { SavedChat } from "../../utils/savedChats";
import type { AppLanguage } from "../../store/appStore";
import { ROUTES } from "../../constants/routes";

type LanguageOption = { value: AppLanguage; label: string };

type MainNavItem = {
  to: string;
  label: string;
  icon: ComponentType<{ size?: number; strokeWidth?: number }>;
  end?: boolean;
};

/*
 * The sidebar is the one navigation surface for the whole app while in
 * chat - it doubles as app navigation and conversation history so we
 * never end up with a second, competing nav system.
 */
const MAIN_NAV: MainNavItem[] = [
  { to: ROUTES.HOME, label: "Home", icon: Home, end: true },
  { to: ROUTES.CHAT, label: "Chat", icon: Sparkles },
  { to: ROUTES.MAP, label: "Marine Map", icon: MapIcon },
  { to: ROUTES.ROUTE, label: "Routes", icon: RouteIcon },
  { to: ROUTES.ALERTS, label: "Alerts", icon: AlertTriangle },
];

type ChatSidebarProps = {
  chats: SavedChat[];
  activeChatId: string | null;
  onSelectChat: (id: string) => void;
  onNewChat: () => void;
  onDeleteChat: (id: string) => void;

  open: boolean;
  onClose: () => void;
  onBackHome: () => void;

  locationLabel: string;
  hasLocation: boolean;
  locationBusy: boolean;
  onUseMyLocation: () => void;
  onChooseArea: () => void;
  onClearLocation: () => void;

  language: AppLanguage;
  languageOptions: LanguageOption[];
  onSetLanguage: (language: AppLanguage) => void;
  voiceSupported: boolean;

  profileHref: string;
};

type ChatGroup = { label: string; chats: SavedChat[] };

function groupChatsByDate(chats: SavedChat[]): ChatGroup[] {
  const now = new Date();
  const startOfDay = (date: Date) =>
    new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

  const today = startOfDay(now);
  const yesterday = today - 86_400_000;
  const weekAgo = today - 7 * 86_400_000;

  const buckets: ChatGroup[] = [
    { label: "Today", chats: [] },
    { label: "Yesterday", chats: [] },
    { label: "Previous 7 days", chats: [] },
    { label: "Older", chats: [] },
  ];

  for (const chat of chats) {
    const updated = new Date(chat.updatedAt).getTime();

    if (updated >= today) {
      buckets[0].chats.push(chat);
    } else if (updated >= yesterday) {
      buckets[1].chats.push(chat);
    } else if (updated >= weekAgo) {
      buckets[2].chats.push(chat);
    } else {
      buckets[3].chats.push(chat);
    }
  }

  return buckets.filter((group) => group.chats.length > 0);
}

export default function ChatSidebar({
  chats,
  activeChatId,
  onSelectChat,
  onNewChat,
  onDeleteChat,
  open,
  onClose,
  onBackHome,
  locationLabel,
  hasLocation,
  locationBusy,
  onUseMyLocation,
  onChooseArea,
  onClearLocation,
  language,
  languageOptions,
  onSetLanguage,
  voiceSupported,
  profileHref,
}: ChatSidebarProps) {
  const [query, setQuery] = useState("");

  const filteredChats = useMemo(() => {
    const trimmed = query.trim().toLowerCase();

    if (!trimmed) {
      return chats;
    }

    return chats.filter((chat) =>
      chat.title.toLowerCase().includes(trimmed),
    );
  }, [chats, query]);

  const groups = useMemo(
    () => groupChatsByDate(filteredChats),
    [filteredChats],
  );

  return (
    <>
      <div
        className={`chat-sidebar-backdrop ${open ? "chat-sidebar-backdrop-visible" : ""}`}
        onClick={onClose}
        aria-hidden="true"
      />

      <aside
        className={`chat-sidebar ${open ? "chat-sidebar-open" : ""}`}
        aria-label="Conversations"
      >
        <div className="chat-sidebar-top">
          <button
            type="button"
            className="chat-sidebar-brand"
            onClick={onBackHome}
            aria-label="Back to Sagar AI dashboard"
          >
            <span className="chat-sidebar-brand-mark">
              <Waves size={16} strokeWidth={2.2} />
            </span>
            <span className="chat-sidebar-brand-name">Sagar AI</span>
          </button>

          <button
            type="button"
            className="chat-sidebar-close"
            onClick={onClose}
            aria-label="Close menu"
          >
            <X size={18} strokeWidth={2} />
          </button>
        </div>

        <button
          type="button"
          className="chat-sidebar-new"
          onClick={onNewChat}
        >
          <Plus size={16} strokeWidth={2.2} />
          New chat
        </button>

        <nav className="chat-sidebar-nav" aria-label="Main navigation">
          <span className="chat-sidebar-section-label">Main</span>

          {MAIN_NAV.map((item) => {
            const Icon = item.icon;

            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={onClose}
                className={({ isActive }) =>
                  `chat-sidebar-nav-link ${
                    isActive ? "chat-sidebar-nav-link-active" : ""
                  }`
                }
              >
                <Icon size={17} strokeWidth={2} />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        <div className="chat-sidebar-divider" />

        <span className="chat-sidebar-section-label chat-sidebar-section-label-conversations">
          Conversations
        </span>

        <label className="chat-sidebar-search">
          <Search size={14} strokeWidth={2} />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search chats"
            aria-label="Search conversations"
          />
        </label>

        <nav
          className="chat-sidebar-history"
          aria-label="Recent conversations"
        >
          {groups.length === 0 ? (
            <div className="chat-sidebar-empty">
              <MessagesSquare size={18} strokeWidth={1.8} />
              <p>
                {query.trim()
                  ? "No matching conversations."
                  : "Your conversations will appear here."}
              </p>
            </div>
          ) : (
            groups.map((group) => (
              <div key={group.label} className="chat-sidebar-group">
                <span className="chat-sidebar-group-label">
                  {group.label}
                </span>

                {group.chats.map((chat) => (
                  <div
                    key={chat.id}
                    className={`chat-sidebar-item ${
                      chat.id === activeChatId
                        ? "chat-sidebar-item-active"
                        : ""
                    }`}
                  >
                    <button
                      type="button"
                      className="chat-sidebar-item-main"
                      onClick={() => onSelectChat(chat.id)}
                      title={chat.title}
                    >
                      <span className="chat-sidebar-item-title">
                        {chat.title}
                      </span>
                    </button>

                    <button
                      type="button"
                      className="chat-sidebar-item-delete"
                      onClick={() => onDeleteChat(chat.id)}
                      aria-label={`Delete "${chat.title}"`}
                    >
                      <Trash2 size={13} strokeWidth={2} />
                    </button>
                  </div>
                ))}
              </div>
            ))
          )}
        </nav>

        <div className="chat-sidebar-footer">
          <div className="chat-sidebar-location">
            <div className="chat-sidebar-location-status">
              <Compass size={13} strokeWidth={2} />
              <span>{locationLabel}</span>
            </div>

            <div className="chat-sidebar-location-actions">
              <button
                type="button"
                onClick={onUseMyLocation}
                disabled={locationBusy}
              >
                {locationBusy ? "Locating…" : "Use my location"}
              </button>

              <button type="button" onClick={onChooseArea}>
                Choose area
              </button>

              {hasLocation && (
                <button
                  type="button"
                  className="chat-sidebar-location-clear"
                  onClick={onClearLocation}
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          <div className="chat-sidebar-language">
            <span className="chat-sidebar-language-label">
              Voice language
            </span>

            <div className="chat-sidebar-language-options">
              {languageOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={option.value === language ? "active" : ""}
                  onClick={() => onSetLanguage(option.value)}
                  aria-pressed={option.value === language}
                >
                  {option.label}
                </button>
              ))}
            </div>

            {!voiceSupported && (
              <p className="chat-sidebar-voice-note">
                Voice input isn't supported in this browser.
              </p>
            )}
          </div>

          <Link to={profileHref} className="chat-sidebar-settings">
            <Settings size={15} strokeWidth={2} />
            Settings &amp; profile
          </Link>
        </div>
      </aside>
    </>
  );
}
