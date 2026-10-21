// Inspired by react-hot-toast library
import { useState, useEffect } from "react";

const TOAST_LIMIT = 20;
const TOAST_REMOVE_DELAY = 300;
const TOAST_DURATION = 6000;
const ACTION_TOAST_DURATION = 30000;

const actionTypes = {
  ADD_TOAST: "ADD_TOAST",
  UPDATE_TOAST: "UPDATE_TOAST",
  DISMISS_TOAST: "DISMISS_TOAST",
  REMOVE_TOAST: "REMOVE_TOAST",
};

let count = 0;

function genId() {
  count = (count + 1) % Number.MAX_VALUE;
  return count.toString();
}

const toastTimeouts = new Map();
const autoDismissTimeouts = new Map();
const toastFocusReturnTargets = new Map();

function captureFocusReturnTarget(element) {
  if (!element || element === document.body) return null;
  return {
    element,
    id: element.id || null,
    ariaLabel: element.getAttribute?.("aria-label") || null,
    testId: element.getAttribute?.("data-testid") || null,
    name: element.getAttribute?.("name") || null,
  };
}

function isAvailableFocusTarget(element) {
  if (!element?.isConnected || element.disabled || element.closest("[inert], [aria-hidden='true']")) return false;
  if (!element.matches("a[href], button, input, select, textarea, [tabindex]")) return false;
  if (element.getClientRects().length === 0) return false;
  const style = window.getComputedStyle(element);
  return style.display !== "none" && style.visibility !== "hidden";
}

function resolveFocusReturnTarget(target) {
  if (isAvailableFocusTarget(target?.element)) return target.element;
  if (!target || typeof document === "undefined") return null;
  if (target.id) {
    const element = document.getElementById(target.id);
    if (isAvailableFocusTarget(element)) return element;
  }

  const selectors = [
    ["[data-testid]", "data-testid", target.testId],
    ["[aria-label]", "aria-label", target.ariaLabel],
    ["[name]", "name", target.name],
  ];
  for (const [selector, attribute, value] of selectors) {
    if (!value) continue;
    const matches = Array.from(document.querySelectorAll(selector)).filter(
      (element) => element.getAttribute(attribute) === value && isAvailableFocusTarget(element)
    );
    if (matches.length === 1) return matches[0];
  }
  return null;
}

const addToRemoveQueue = (toastId) => {
  if (toastTimeouts.has(toastId)) {
    return;
  }

  const timeout = setTimeout(() => {
    toastTimeouts.delete(toastId);
    dispatch({
      type: actionTypes.REMOVE_TOAST,
      toastId,
    });
  }, TOAST_REMOVE_DELAY);

  toastTimeouts.set(toastId, timeout);
};

const _clearFromRemoveQueue = (toastId) => {
  const timeout = toastTimeouts.get(toastId);
  if (timeout) {
    clearTimeout(timeout);
    toastTimeouts.delete(toastId);
  }
};

export const reducer = (state, action) => {
  switch (action.type) {
    case actionTypes.ADD_TOAST:
      return {
        ...state,
        toasts: [action.toast, ...state.toasts].slice(0, TOAST_LIMIT),
      };

    case actionTypes.UPDATE_TOAST:
      return {
        ...state,
        toasts: state.toasts.map((t) =>
          t.id === action.toast.id ? { ...t, ...action.toast } : t
        ),
      };

    case actionTypes.DISMISS_TOAST: {
      const { toastId } = action;

      // ! Side effects ! - This could be extracted into a dismissToast() action,
      // but I'll keep it here for simplicity
      if (toastId) {
        addToRemoveQueue(toastId);
      } else {
        state.toasts.forEach((toast) => {
          addToRemoveQueue(toast.id);
        });
      }

      return {
        ...state,
        toasts: state.toasts.map((t) =>
          t.id === toastId || toastId === undefined
            ? {
                ...t,
                open: false,
              }
            : t
        ),
      };
    }
    case actionTypes.REMOVE_TOAST:
      if (action.toastId === undefined) {
        return {
          ...state,
          toasts: [],
        };
      }
      return {
        ...state,
        toasts: state.toasts.filter((t) => t.id !== action.toastId),
      };
  }
};

const listeners = [];

let memoryState = { toasts: [] };

function dispatch(action) {
  memoryState = reducer(memoryState, action);
  listeners.forEach((listener) => {
    listener(memoryState);
  });
}

function dismissToast(toastId) {
  if (typeof document !== "undefined") {
    const candidates = toastId
      ? memoryState.toasts.filter((item) => item.id === toastId)
      : memoryState.toasts;
    for (const item of candidates) {
      const toastElement = document.querySelector(`[data-toast-id="${item.id}"]`);
      const returnFocusTarget = toastFocusReturnTargets.get(item.id);
      if (toastElement?.contains(document.activeElement) && resolveFocusReturnTarget(returnFocusTarget)) {
        setTimeout(() => {
          resolveFocusReturnTarget(returnFocusTarget)?.focus({ preventScroll: true });
        }, 0);
        break;
      }
    }
  }

  if (toastId) toastFocusReturnTargets.delete(toastId);
  else toastFocusReturnTargets.clear();

  if (toastId) {
    const timer = autoDismissTimeouts.get(toastId);
    if (timer?.timeout) clearTimeout(timer.timeout);
    autoDismissTimeouts.delete(toastId);
  } else {
    autoDismissTimeouts.forEach((timer) => {
      if (timer.timeout) clearTimeout(timer.timeout);
    });
    autoDismissTimeouts.clear();
  }
  dispatch({ type: actionTypes.DISMISS_TOAST, toastId });
}

function startAutoDismiss(toastId, timer) {
  if (timer.pauseReasons.size || timer.timeout) return;
  timer.startedAt = Date.now();
  timer.timeout = setTimeout(() => {
    timer.timeout = null;
    timer.remaining = 0;
    dismissToast(toastId);
  }, timer.remaining);
}

function pauseAutoDismiss(toastId, reason) {
  const timer = autoDismissTimeouts.get(toastId);
  if (!timer || timer.pauseReasons.has(reason)) return;
  timer.pauseReasons.add(reason);
  if (timer.timeout) {
    clearTimeout(timer.timeout);
    timer.timeout = null;
    timer.remaining = Math.max(0, timer.remaining - (Date.now() - timer.startedAt));
  }
}

function resumeAutoDismiss(toastId, reason) {
  const timer = autoDismissTimeouts.get(toastId);
  if (!timer) return;
  timer.pauseReasons.delete(reason);
  startAutoDismiss(toastId, timer);
}

function toast({ duration, returnFocusElement, ...props }) {
  const id = genId();
  if (typeof document !== "undefined") {
    toastFocusReturnTargets.set(id, captureFocusReturnTarget(returnFocusElement ?? document.activeElement));
  }

  const update = (props) =>
    dispatch({
      type: actionTypes.UPDATE_TOAST,
      toast: { ...props, id },
    });

  const dismiss = () => dismissToast(id);

  dispatch({
    type: actionTypes.ADD_TOAST,
    toast: {
      ...props,
      id,
      open: true,
      onOpenChange: (open) => {
        if (!open) dismiss();
      },
    },
  });

  const autoDuration = Number.isFinite(duration)
    ? Math.max(0, duration)
    : props.action ? ACTION_TOAST_DURATION : TOAST_DURATION;
  const timer = { remaining: autoDuration, startedAt: 0, timeout: null, pauseReasons: new Set() };
  autoDismissTimeouts.set(id, timer);
  startAutoDismiss(id, timer);

  return {
    id,
    dismiss,
    update,
  };
}

function useToast() {
  const [state, setState] = useState(memoryState);

  useEffect(() => {
    listeners.push(setState);
    return () => {
      const index = listeners.indexOf(setState);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    };
  }, [state]);

  return {
    ...state,
    toast,
    dismiss: dismissToast,
    pauseAutoDismiss,
    resumeAutoDismiss,
  };
}

export { useToast, toast };
