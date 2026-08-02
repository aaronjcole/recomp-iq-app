import { useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { getTabRootPath, isTabRootPath } from "@/lib/tabNavigation";

export default function AndroidBackHandler() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    window.handleAndroidBack = () => {
      if (isTabRootPath(location.pathname)) {
        return false;
      }
      const idx = window.history.state?.idx ?? 0;
      if (idx > 0) {
        navigate(-1);
        return true;
      }
      const tabRootPath = getTabRootPath(location.pathname);
      if (tabRootPath) {
        navigate(tabRootPath, { replace: true });
        return true;
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
