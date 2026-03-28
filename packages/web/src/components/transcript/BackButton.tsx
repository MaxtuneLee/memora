import { memo } from "react";
import { Button } from "@base-ui/react/button";
import { ArrowLeftIcon } from "@phosphor-icons/react";
import { useNavigate } from "react-router";

export const BackButton = memo(() => {
  const navigate = useNavigate();
  return (
    <Button
      className="memora-interactive group inline-flex cursor-pointer select-none items-center gap-2 px-0 py-1 text-sm font-medium text-[var(--color-memora-text-muted)] transition-colors hover:text-[var(--color-memora-text-strong)]"
      onClick={() => navigate(-1)}
    >
      <ArrowLeftIcon
        size={18}
        weight="bold"
        className="transition-transform duration-200 ease-[var(--ease-out-quart)] group-hover:-translate-x-0.5"
      />
      <span>Go back</span>
    </Button>
  );
});
