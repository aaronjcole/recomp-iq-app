import { useToast } from "@/components/ui/use-toast";
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast";

export function Toaster() {
  const { toasts, pauseAutoDismiss, resumeAutoDismiss } = useToast();

  return (
    <ToastProvider>
      {toasts.map(function ({ id, title, description, action, open, onOpenChange, ...props }) {
        return (
          <Toast
            key={id}
            {...props}
            open={open}
            onMouseEnter={() => pauseAutoDismiss(id, "hover")}
            onMouseLeave={() => resumeAutoDismiss(id, "hover")}
            onFocus={() => pauseAutoDismiss(id, "focus")}
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget)) {
                resumeAutoDismiss(id, "focus");
              }
            }}
          >
            <div className="grid gap-1">
              {title && <ToastTitle>{title}</ToastTitle>}
              {description && (
                <ToastDescription>{description}</ToastDescription>
              )}
            </div>
            {action}
            <ToastClose onClick={() => onOpenChange?.(false)} />
          </Toast>
        );
      })}
      <ToastViewport />
    </ToastProvider>
  );
}
