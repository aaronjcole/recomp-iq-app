import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { getRouteMetadata } from "@/lib/routeMetadata";

export default function RouteAccessibility() {
  const { pathname } = useLocation();
  const metadata = getRouteMetadata(pathname);

  useEffect(() => {
    document.title = metadata.title;
    document
      .querySelector('meta[name="description"]')
      ?.setAttribute("content", metadata.description);
  }, [metadata.description, metadata.title]);

  return (
    <>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-panel focus:px-4 focus:py-3 focus:text-sm focus:font-semibold focus:text-foreground focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-teal"
      >
        Skip to main content
      </a>
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {metadata.announcement}
      </div>
    </>
  );
}
