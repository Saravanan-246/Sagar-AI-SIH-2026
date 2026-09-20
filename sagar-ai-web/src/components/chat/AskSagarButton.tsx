import { MessageCircleQuestion } from "lucide-react";
import { useNavigate } from "react-router-dom";

import Button from "../ui/Button";
import { useAppStore } from "../../store/appStore";
import { ROUTES } from "../../constants/routes";

type AskSagarButtonProps = {
  /** A question built from this page's own real, already-resolved data
   * (an area name, a risk level, a route's origin/destination, an
   * alert's title...) - never parsed from rendered UI text. Asked
   * through Chat's existing send pipeline once Chat mounts, so Sagar
   * answers using the same deterministic pipeline as if the user had
   * typed and sent it themselves - never a second chat mechanism. */
  prompt: string;
  label?: string;
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md";
  fullWidth?: boolean;
  className?: string;
};

export default function AskSagarButton({
  prompt,
  label = "Ask Sagar",
  variant = "secondary",
  size = "sm",
  fullWidth = false,
  className,
}: AskSagarButtonProps) {
  const navigate = useNavigate();
  const setPendingChatPrompt = useAppStore(
    (state) => state.setPendingChatPrompt,
  );

  const handleClick = () => {
    setPendingChatPrompt(prompt);
    navigate(ROUTES.CHAT);
  };

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      fullWidth={fullWidth}
      className={className}
      onClick={handleClick}
    >
      <MessageCircleQuestion size={14} />
      {label}
    </Button>
  );
}
