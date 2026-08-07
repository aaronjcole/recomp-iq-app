import { Component } from "react";
import { RefreshCw } from "lucide-react";
import { reportError } from "@/lib/telemetry";

// Two shapes from one boundary:
//   variant="reload" (default, root) — a full-screen fallback whose recovery is
//     a hard reload, for crashes that take down the whole shell.
//   variant="inline" (route-scoped)  — an in-place card that resets state
//     without a reload, so navigating away (a new resetKey) clears it and the
//     rest of the app stays interactive.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    reportError(error, {
      componentStack: info?.componentStack,
      boundary: this.props.name || "root",
    });
  }

  componentDidUpdate(prevProps) {
    // When the route changes, clear a route-scoped error so the next screen
    // gets a clean render instead of the stuck fallback.
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false });
    }
  }

  handleReset = () => {
    if (this.props.variant === "inline") {
      this.setState({ hasError: false });
      return;
    }
    this.setState({ hasError: false });
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    if (this.props.variant === "inline") {
      return (
        <div
          role="alert"
          className="mx-auto my-10 max-w-sm rounded-xl border border-border bg-card px-6 py-8 text-center"
        >
          <div className="w-11 h-11 rounded-xl bg-teal/15 flex items-center justify-center mx-auto mb-4">
            <RefreshCw className="w-5 h-5 text-teal" />
          </div>
          <h2 className="text-base font-semibold">This screen hit a snag</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Try again, or use the back button to move on.
          </p>
          <button
            onClick={this.handleReset}
            className="mt-5 inline-flex items-center gap-2 h-11 px-5 rounded-md bg-teal text-buttonText text-sm font-medium hover:opacity-90"
          >
            <RefreshCw className="w-4 h-4" /> Try again
          </button>
        </div>
      );
    }

    return (
      <div
        role="alert"
        className="fixed inset-0 flex flex-col items-center justify-center bg-bg text-foreground px-6 text-center"
      >
        <div className="w-12 h-12 rounded-xl bg-teal/15 flex items-center justify-center mb-4">
          <RefreshCw className="w-6 h-6 text-teal" />
        </div>
        <h1 className="text-lg font-semibold">Something went wrong</h1>
        <p className="text-sm text-muted-foreground mt-1 max-w-xs">
          RecompOne hit an unexpected error. Reloading usually fixes it.
        </p>
        <button
          onClick={this.handleReset}
          className="mt-5 inline-flex items-center gap-2 h-11 px-5 rounded-md bg-teal text-buttonText text-sm font-medium hover:opacity-90"
        >
          <RefreshCw className="w-4 h-4" /> Reload app
        </button>
      </div>
    );
  }
}
