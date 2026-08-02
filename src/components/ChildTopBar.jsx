import { useNavigate } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ChildTopBar({ title, fallbackTo = "/more" }) {
  const navigate = useNavigate();
  const goBack = () => {
    const historyIndex = window.history.state?.idx ?? 0;
    if (historyIndex > 0) navigate(-1);
    else navigate(fallbackTo, { replace: true });
  };

  return (
    <div className="sticky top-0 z-40 -mx-4 mb-3 bg-bg/95 backdrop-blur px-4 pb-2 pt-[calc(env(safe-area-inset-top)+0.5rem)]">
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="h-11 min-h-11 w-11 min-w-11 -my-1 -ml-2"
          onClick={goBack}
          aria-label="Back"
        >
          <ChevronLeft className="w-5 h-5" />
        </Button>
        <h1 className="text-lg font-semibold">{title}</h1>
      </div>
    </div>
  );
}
