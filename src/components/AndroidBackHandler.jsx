import { useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { resolveAndroidBack } from "@/lib/androidBack";

export default function AndroidBackHandler() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    window.handleAndroidBack = () => {
      const action = resolveAndroidBack(
        location.pathname,
        window.history.state?.idx ?? 0
      );
      if (action.type === "exit") {
        return false;
      }
      if (action.type === "back") {
        navigate(-1);
        return true;
      }
      navigate(action.to, { replace: action.replace });
      return true;
    };
    return () => {
      delete window.handleAndroidBack;
    };
  }, [location.pathname, navigate]);

  return null;
}
