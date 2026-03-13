import { memo } from "react";
import { Button } from "@base-ui/react/button";
import { ArrowLeftIcon } from "@phosphor-icons/react";
import { useNavigate } from "react-router";

export const BackButton = memo(() => {
  const navigate = useNavigate();
  return (
    <Button
      className="flex items-center gap-1.5 opacity-65 hover:opacity-90 cursor-pointer select-none"
      onClick={() => navigate(-1)}
    >
      <ArrowLeftIcon size={24} weight="bold" />
      <span>Go back</span>
    </Button>
  );
});
