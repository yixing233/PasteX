import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useKeyPress } from "ahooks";
import {
  type MouseEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router-dom";
import { getKeySymbol } from "@/components/ProShortcut/keyboard";
import { PRESET_SHORTCUT } from "@/constants";
import {
  LINK_PROMPT_OPEN_EVENT,
  resizeLinkPromptWindow,
} from "@/plugins/linkPrompt";

const appWindow = getCurrentWebviewWindow();
const LINK_PROMPT_MIN_HEIGHT = 84;

const parsePromptUrl = () => {
  const searchParams = new URLSearchParams(window.location.search);
  const directUrl = searchParams.get("url");
  if (directUrl) return directUrl;

  const hashPart = window.location.hash || "";
  const query = hashPart.includes("?") ? hashPart.split("?")[1] : "";
  const hashParams = new URLSearchParams(query);

  return hashParams.get("url") || "";
};

const parsePromptDark = () => {
  const searchParams = new URLSearchParams(window.location.search);
  const directDark = searchParams.get("dark");
  if (directDark) return directDark === "1";

  const hashPart = window.location.hash || "";
  const query = hashPart.includes("?") ? hashPart.split("?")[1] : "";
  const hashParams = new URLSearchParams(query);

  return hashParams.get("dark") === "1";
};

const LinkOpenPrompt = () => {
  const { t } = useTranslation();
  const location = useLocation();
  const [url, setUrl] = useState("");
  const [isDark, setIsDark] = useState(false);
  const [countdown, setCountdown] = useState(3);
  const cardRef = useRef<HTMLDivElement>(null);
  const urlRef = useRef("");
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const countdownTimerRef = useRef<ReturnType<typeof setInterval>>();

  const shortcutLabel = useMemo(
    () =>
      PRESET_SHORTCUT.OPEN_LINK_PROMPT.split(".").map(getKeySymbol).join(" + "),
    [],
  );

  const handleOpen = useCallback(() => {
    const currentUrl = urlRef.current;

    if (!currentUrl) return;

    void openUrl(currentUrl);
    void appWindow.close();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const initialUrl = params.get("url") || parsePromptUrl();
    const initialDark = parsePromptDark();
    urlRef.current = initialUrl;
    setUrl(initialUrl);
    setIsDark(initialDark);

    let unlisten: (() => void) | undefined;

    void appWindow
      .listen<{ isDark?: boolean; url?: string }>(
        "link-open-prompt:update",
        ({ payload }) => {
          const nextUrl = String(payload?.url || "").trim();
          if (!nextUrl) return;
          urlRef.current = nextUrl;
          setUrl(nextUrl);
          setIsDark(Boolean(payload?.isDark));
        },
      )
      .then((fn) => {
        unlisten = fn;
      });

    return () => {
      if (unlisten) unlisten();
    };
  }, [location.search]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;

    void appWindow.listen(LINK_PROMPT_OPEN_EVENT, handleOpen).then((fn) => {
      unlisten = fn;
    });

    return () => {
      unlisten?.();
    };
  }, [handleOpen]);

  useLayoutEffect(() => {
    if (!url || !cardRef.current) return;

    let cancelled = false;
    let animationFrame = 0;

    const resizeWindow = () => {
      cancelAnimationFrame(animationFrame);
      animationFrame = requestAnimationFrame(async () => {
        const card = cardRef.current;
        if (!card || cancelled) return;

        const targetHeight = Math.max(
          LINK_PROMPT_MIN_HEIGHT,
          Math.ceil(card.getBoundingClientRect().height),
        );
        await resizeLinkPromptWindow(targetHeight).catch(() => undefined);
      });
    };

    const observer = new ResizeObserver(resizeWindow);
    observer.observe(cardRef.current);
    resizeWindow();

    return () => {
      cancelled = true;
      cancelAnimationFrame(animationFrame);
      observer.disconnect();
    };
  }, [url]);

  useEffect(() => {
    if (!url) return;

    setCountdown(3);

    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
    }

    countdownTimerRef.current = setInterval(() => {
      setCountdown((prev) => Math.max(0, prev - 1));
    }, 1000);

    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    timerRef.current = setTimeout(() => {
      void appWindow.close();
    }, 3000);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      if (countdownTimerRef.current) {
        clearInterval(countdownTimerRef.current);
      }
    };
  }, [url]);

  // 在链接弹窗中使用快捷键打开链接
  useKeyPress(
    (event) => {
      const e = event as KeyboardEvent;
      const key = e.key?.toLowerCase();

      return (e.ctrlKey || e.metaKey) && key === "q";
    },
    (event) => {
      event.preventDefault();
      handleOpen();
    },
  );

  const handleClose = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    void appWindow.close();
  };

  return (
    <div
      className={
        isDark
          ? "relative box-border w-screen cursor-pointer rounded-xl bg-black/82 p-3 text-left text-white outline-none backdrop-blur focus:outline-none focus-visible:outline-none"
          : "relative box-border w-screen cursor-pointer rounded-xl bg-white/96 p-3 text-left text-black outline-none backdrop-blur focus:outline-none focus-visible:outline-none"
      }
      onClick={handleOpen}
      ref={cardRef}
    >
      <button
        className={
          isDark
            ? "group absolute top-0 right-0 flex h-7 w-9 items-center justify-center rounded-tr-xl bg-transparent text-white/70 transition-colors hover:bg-[#E81123] hover:text-white"
            : "group absolute top-0 right-0 flex h-7 w-9 items-center justify-center rounded-tr-xl bg-transparent text-black/50 transition-colors hover:bg-[#E81123] hover:text-white"
        }
        onClick={handleClose}
        type="button"
      >
        <span className="select-none text-xs leading-none">✕</span>
      </button>
      <div className="mb-1 flex items-center gap-2 pr-10">
        <div className="font-semibold text-sm">
          {t("clipboard.hints.open_link_prompt")}
        </div>
        <div
          className={isDark ? "text-white/60 text-xs" : "text-black/45 text-xs"}
        >
          {countdown}s
        </div>
      </div>
      <div
        className={
          isDark
            ? "mb-1 text-[11px] text-white/60 leading-4"
            : "mb-1 text-[11px] text-black/45 leading-4"
        }
      >
        {t("clipboard.hints.open_link_prompt_shortcut", {
          shortcut: shortcutLabel,
        })}
      </div>
      <div
        className={
          isDark
            ? "line-clamp-2 break-all text-white/85 text-xs leading-4"
            : "line-clamp-2 break-all text-black/70 text-xs leading-4"
        }
      >
        {url}
      </div>
    </div>
  );
};

export default LinkOpenPrompt;
