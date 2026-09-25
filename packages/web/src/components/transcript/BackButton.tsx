import { memo } from "react";
import { Button } from "@base-ui/react/button";
import { ArrowLeftIcon } from "@phosphor-icons/react";
import { useNavigate } from "react-router";
import * as stylex from "@stylexjs/stylex";
import { tokens } from "../../styles/stylex.stylex";

const styles = stylex.create({
  button: {
    alignItems: "center",
    color: tokens.textMuted,
    cursor: "pointer",
    display: "inline-flex",
    fontSize: 14,
    fontWeight: 500,
    gap: 8,
    paddingBlock: 4,
    paddingInline: 0,
    transition: "color 150ms",
    userSelect: "none",
    ":hover": { color: tokens.textStrong },
  },
  icon: { transition: "transform 200ms var(--ease-out-quart)" },
});

export const BackButton = memo(() => {
  const navigate = useNavigate();
  return (
    <Button
      className={`memora-interactive ${stylex.props(styles.button).className}`}
      onClick={() => navigate(-1)}
    >
      <ArrowLeftIcon size={18} weight="bold" className={stylex.props(styles.icon).className} />
      <span>Go back</span>
    </Button>
  );
});
