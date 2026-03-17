import { memo } from "react";
import { Button } from "@base-ui/react/button";
import { ArrowLeftIcon } from "@phosphor-icons/react";
import { useNavigate } from "react-router";

export const BackButton = memo(() => {
  const navigate = useNavigate();
  return (
    <Button
      className="inline-flex items-center gap-2 text-sm font-medium text-zinc-500 transition-colors hover:text-zinc-900 cursor-pointer select-none"
      onClick={() => navigate(-1)}
    >
      <ArrowLeftIcon size={18} weight="bold" />
      <span>Go back</span>
    </Button>
  );
});
