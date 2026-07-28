import { useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";

const ROOT_TABS = ["/today", "/nutrition", "/training", "/progress", "/more"];

export default function AndroidBackHandler() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    window.handleAndroidBack = () => {
      const idx = window.history.state?.idx ?? 0;
      if (idx > 0) {
        navigate(-1);
        return true;
      }
      if (ROOT_TABS.includes(location.pathname)) {
        return false;
      }
      navigate("/");
      return true;
    };
    return () => {
      delete window.handleAndroidBack;
    };
  }, [location.pathname, navigate]);

  return null;
}