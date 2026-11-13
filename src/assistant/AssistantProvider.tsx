import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { pageContext, type AssistantPageContext } from "./pageRegistry";
import { dataStore } from "../data";
const Context = createContext<{
  context: AssistantPageContext;
  dirty: boolean;
  markClean: () => void;
  register: (value: Partial<AssistantPageContext>) => () => void;
} | null>(null);
export function AssistantProvider({ children }: { children: any }) {
  const location = useLocation();
  const [dirty, setDirty] = useState(false),
    [extras, setExtras] = useState<Partial<AssistantPageContext>>({});
  useEffect(() => {
    setDirty(false);
  }, [location.pathname, location.search]);
  useEffect(() => {
    const input = (e: Event) => {
      const el = e.target as HTMLElement;
      if (
        !el.closest("[data-assistant]") &&
        el.closest('input,textarea,[contenteditable="true"],select')
      )
        setDirty(true);
    };
    document.addEventListener("input", input, true);
    document.addEventListener("change", input, true);
    return () => {
      document.removeEventListener("input", input, true);
      document.removeEventListener("change", input, true);
    };
  }, []);
  const contextVersion = useRef({ signature: "", value: 0 });
  const context = {
    ...pageContext(location.pathname, location.search, 0),
    ...extras,
    hasUnsavedChanges:
      dirty ||
      extras.hasUnsavedChanges === true ||
      (dataStore.hasPendingWrites?.() ?? false),
  };
  const signature = JSON.stringify(context);
  if (contextVersion.current.signature !== signature)
    contextVersion.current = {
      signature,
      value: contextVersion.current.value + 1,
    };
  context.contextVersion = contextVersion.current.value;
  useEffect(() => {
    document.documentElement.toggleAttribute(
      "data-assistant-dirty",
      context.hasUnsavedChanges,
    );
    return () =>
      document.documentElement.removeAttribute("data-assistant-dirty");
  }, [context.hasUnsavedChanges]);
  const register = useMemo(
    () => (value: Partial<AssistantPageContext>) => {
      setExtras(value);
      return () => setExtras({});
    },
    [],
  );
  return (
    <Context.Provider
      value={{
        context,
        dirty: context.hasUnsavedChanges,
        markClean: () => setDirty(false),
        register,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useAssistant() {
  const value = useContext(Context);
  if (!value) throw new Error("AssistantProvider missing");
  return value;
}
export function useAssistantPageContext(value: Partial<AssistantPageContext>) {
  const api = useContext(Context);
  const serialized = JSON.stringify(value);
  useEffect(() => api?.register(value), [api?.register, serialized]);
}
