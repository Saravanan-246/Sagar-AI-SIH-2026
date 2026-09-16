import { Compass, Menu, SquarePen } from "lucide-react";

type ChatHeaderProps = {
  title: string;
  locationLabel: string;
  onMenuClick: () => void;
  onNewChat: () => void;
};

export default function ChatHeader({
  title,
  locationLabel,
  onMenuClick,
  onNewChat,
}: ChatHeaderProps) {
  return (
    <header className="chat-header">
      <div className="chat-header-left">
        <button
          type="button"
          className="chat-header-menu"
          onClick={onMenuClick}
          aria-label="Open conversations"
        >
          <Menu size={19} strokeWidth={2} />
        </button>

        <div className="chat-header-title-group">
          <span className="chat-header-title">{title}</span>

          <span className="chat-header-location">
            <Compass size={11} strokeWidth={2} />
            {locationLabel}
          </span>
        </div>
      </div>

      <div className="chat-header-right">
        <button
          type="button"
          className="chat-header-new-chat"
          onClick={onNewChat}
          aria-label="Start a new chat"
          title="New chat"
        >
          <SquarePen size={18} strokeWidth={2} />
        </button>
      </div>
    </header>
  );
}
