import { Component } from "react";
import { RefreshCw } from "lucide-react";

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error("RecompIQ crash:", error, info);
  }

  handleReload = () => {
    this.setState({ hasError: false });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="fixed inset-0 flex flex-col items-center justify-center bg-bg text-foreground px-6 text-center">
          <div className="w-12 h-12 rounded-xl bg-teal/15 flex items-center justify-center mb-4">
            <RefreshCw className="w-6 h-6 text-teal" />
          </div>
          <h1 className="text-lg font-semibold">Something went wrong</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-xs">
            RecompIQ hit an unexpected error. Reloading usually fixes it.
          </p>
          <button
            onClick={this.handleReload}
            className="mt-5 inline-flex items-center gap-2 h-11 px-5 rounded-md bg-teal text-buttonText text-sm font-medium hover:opacity-90"
          >
            <RefreshCw className="w-4 h-4" /> Reload app
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}