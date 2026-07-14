import { useMount } from "ahooks";
import clsx from "clsx";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSnapshot } from "valtio";
import ProList from "@/components/ProList";
import ProSwitch from "@/components/ProSwitch";
import UnoIcon from "@/components/UnoIcon";
import { clipboardStore } from "@/stores/clipboard";
import AudioSettings from "./components/AudioSettings";
import AutoPaste from "./components/AutoPaste";
import BlacklistApps from "./components/BlacklistApps";
import CleaningRules from "./components/CleaningRules";
import DefaultApps from "./components/DefaultApps";
import OperationButton from "./components/OperationButton";
import SearchPosition from "./components/SearchPosition";
import TagSettings from "./components/TagSettings";
import WindowPosition from "./components/WindowPosition";

const ANCHOR_TOP_OFFSET = 64;

const ClipboardSettings = () => {
  const { window, search, content } = useSnapshot(clipboardStore);
  const { t } = useTranslation();
  const [activeAnchor, setActiveAnchor] = useState("window");
  const activeAnchorRef = useRef(activeAnchor);
  const tabsRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const sectionsRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const tabsScrollRef = useRef<HTMLDivElement>(null);
  const isClickScrolling = useRef(false);
  const clickTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const tabsScrollAnimationRef = useRef<number | null>(null);
  const [indicatorStyle, setIndicatorStyle] = useState({
    left: 0,
    opacity: 0,
    width: 0,
  });

  const animateTabsScrollTo = (
    container: HTMLDivElement,
    targetLeft: number,
    behavior: ScrollBehavior,
  ) => {
    const clampedTarget = Math.max(
      0,
      Math.min(targetLeft, container.scrollWidth - container.clientWidth),
    );

    if (tabsScrollAnimationRef.current !== null) {
      cancelAnimationFrame(tabsScrollAnimationRef.current);
      tabsScrollAnimationRef.current = null;
    }

    if (behavior === "auto") {
      container.scrollLeft = clampedTarget;
      return;
    }

    const startLeft = container.scrollLeft;
    const delta = clampedTarget - startLeft;
    if (Math.abs(delta) < 1) return;

    const duration = 220;
    const startTime = performance.now();

    const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

    const tick = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / duration);
      container.scrollLeft = startLeft + delta * easeOutCubic(progress);

      if (progress < 1) {
        tabsScrollAnimationRef.current = requestAnimationFrame(tick);
      } else {
        tabsScrollAnimationRef.current = null;
      }
    };

    tabsScrollAnimationRef.current = requestAnimationFrame(tick);
  };

  const ensureTabVisible = (
    key: string,
    behavior: ScrollBehavior = "smooth",
  ) => {
    const container = tabsScrollRef.current;
    const activeTab = tabsRef.current.get(key);

    if (!container || !activeTab) return;

    const tabCenter = activeTab.offsetLeft + activeTab.offsetWidth / 2;
    const targetLeft = tabCenter - container.clientWidth / 2;

    animateTabsScrollTo(container, targetLeft, behavior);
  };

  const updateIndicator = (key: string) => {
    const activeTab = tabsRef.current.get(key);
    if (activeTab) {
      setIndicatorStyle({
        left: activeTab.offsetLeft,
        opacity: 1,
        width: activeTab.offsetWidth,
      });
    }
  };

  const scrollToAnchor = (key: string) => {
    // Cancel any pending unlock timer
    if (clickTimerRef.current) {
      clearTimeout(clickTimerRef.current);
    }

    // Lock scroll spy
    isClickScrolling.current = true;

    // Update indicator immediately
    setActiveAnchor(key);

    const container = document.getElementById("preference-content");
    const element = sectionsRef.current.get(key);

    if (container && element) {
      // Calculate target scroll position
      const containerRect = container.getBoundingClientRect();
      const elementRect = element.getBoundingClientRect();
      const targetScroll = Math.max(
        0,
        container.scrollTop +
          (elementRect.top - containerRect.top) -
          ANCHOR_TOP_OFFSET,
      );

      // Use scrollTo - calling it again will interrupt the previous smooth scroll
      container.scrollTo({
        behavior: "smooth",
        top: targetScroll,
      });
    }

    // Unlock scroll spy after scroll animation completes
    clickTimerRef.current = setTimeout(() => {
      isClickScrolling.current = false;
    }, 600);
  };

  const scrollTabs = (direction: "left" | "right") => {
    const container = tabsScrollRef.current;
    if (!container) return;

    const step = Math.max(120, Math.floor(container.clientWidth * 0.6));
    container.scrollBy({
      behavior: "smooth",
      left: direction === "left" ? -step : step,
    });
  };

  useMount(() => {
    // Initial indicator position
    setTimeout(() => {
      updateIndicator(activeAnchor);
      ensureTabVisible(activeAnchor, "auto");
    }, 50);

    const container = document.getElementById("preference-content");
    if (!container) return;

    let rafId = 0;
    const anchors = [
      "window",
      "audio",
      "search",
      "content",
      "list",
      "default-apps",
    ];

    const handleScroll = () => {
      if (isClickScrolling.current) return;
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        // Check if the component is visible by checking the first anchor's offsetParent
        // If hidden (display: none), offsetParent is null.
        const firstAnchor = sectionsRef.current.get(anchors[0]);
        if (!firstAnchor || firstAnchor.offsetParent === null) {
          return;
        }

        const { scrollTop, scrollHeight, clientHeight } = container;

        // Force select last anchor if scrolled to bottom
        if (scrollTop + clientHeight >= scrollHeight - 20) {
          setActiveAnchor(anchors[anchors.length - 1]);
          return;
        }

        const containerTop = container.getBoundingClientRect().top;
        const offset = ANCHOR_TOP_OFFSET;
        let current = anchors[0];

        for (const anchor of anchors) {
          const el = sectionsRef.current.get(anchor);
          if (el) {
            const top = el.getBoundingClientRect().top;
            if (top <= containerTop + offset) {
              current = anchor;
            }
          }
        }

        setActiveAnchor(current);
      });
    };

    container.addEventListener("scroll", handleScroll, { passive: true });

    // ResizeObserver to handle layout changes (e.g. font loading)
    const resizeObserver = new ResizeObserver(() => {
      updateIndicator(activeAnchorRef.current);
      ensureTabVisible(activeAnchorRef.current, "auto");
    });

    // Observe the navigation container specific for tabs
    const navContainer = tabsRef.current.get("window")?.parentElement;
    if (navContainer) {
      resizeObserver.observe(navContainer);
      // Also observe children to be safe against font shifts inside items
      for (const child of navContainer.children) {
        resizeObserver.observe(child);
      }
    }

    return () => {
      cancelAnimationFrame(rafId);
      if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
      if (tabsScrollAnimationRef.current !== null) {
        cancelAnimationFrame(tabsScrollAnimationRef.current);
        tabsScrollAnimationRef.current = null;
      }
      container.removeEventListener("scroll", handleScroll);
      resizeObserver.disconnect();
    };
  });

  // Update indicator when activeAnchor changes
  useEffect(() => {
    activeAnchorRef.current = activeAnchor;
    updateIndicator(activeAnchor);
    ensureTabVisible(activeAnchor);
  }, [activeAnchor]);

  return (
    <>
      <div
        className="sticky top-0 z-10 pt-2 pb-1 backdrop-blur-[10px]"
        style={{
          backgroundColor:
            "color-mix(in srgb, var(--ant-color-bg-layout), transparent 80%)",
        }}
      >
        <style>
          {`
            .clipboard-tabs-scroll::-webkit-scrollbar {
              display: none;
              height: 0;
            }
          `}
        </style>

        <div className="flex items-center gap-1">
          <button
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-color-2 leading-none transition hover:bg-gray-100/50 dark:hover:bg-gray-800/50"
            onClick={() => scrollTabs("left")}
            type="button"
          >
            <UnoIcon name="i-lucide:chevron-left" size={14} />
          </button>

          <div
            className="clipboard-tabs-scroll no-scrollbar relative flex flex-1 gap-4 overflow-x-auto"
            ref={tabsScrollRef}
            style={{ msOverflowStyle: "none", scrollbarWidth: "none" }}
          >
            {/* Animated Indicator */}
            <div
              className="pointer-events-none absolute top-0 bottom-0 rounded bg-primary transition-all duration-300 ease-[cubic-bezier(0.25,0.1,0.25,1.0)]"
              style={{
                left: indicatorStyle.left,
                opacity: indicatorStyle.opacity,
                width: indicatorStyle.width,
              }}
            />

            {[
              {
                key: "window",
                title: t("preference.clipboard.window_settings.title"),
              },
              {
                key: "audio",
                title: t("preference.clipboard.audio_settings.title"),
              },
              {
                key: "search",
                title: t("preference.clipboard.search_box_settings.title"),
              },
              {
                key: "content",
                title: t("preference.clipboard.content_settings.title"),
              },
              {
                key: "list",
                title: t("preference.clipboard.list_settings.title"),
              },
              {
                key: "default-apps",
                title: t("preference.clipboard.default_apps.title"),
              },
            ].map((item) => (
              <div
                className={clsx(
                  "relative z-10 shrink-0 cursor-pointer select-none rounded px-2 py-1 text-xs transition-colors duration-300",
                  activeAnchor === item.key
                    ? "font-bold text-white"
                    : "text-color-2 hover:bg-gray-100/50 dark:hover:bg-gray-800/50",
                )}
                key={item.key}
                onClick={() => scrollToAnchor(item.key)}
                ref={(el) => {
                  if (el) tabsRef.current.set(item.key, el);
                  else tabsRef.current.delete(item.key);
                }}
              >
                {item.title}
              </div>
            ))}
          </div>

          <button
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-color-2 leading-none transition hover:bg-gray-100/50 dark:hover:bg-gray-800/50"
            onClick={() => scrollTabs("right")}
            type="button"
          >
            <UnoIcon name="i-lucide:chevron-right" size={14} />
          </button>
        </div>
      </div>

      <div
        className="mb-6 scroll-mt-14"
        ref={(el) => {
          if (el) sectionsRef.current.set("window", el);
        }}
      >
        <ProList header={t("preference.clipboard.window_settings.title")}>
          <WindowPosition />

          <ProSwitch
            description={t(
              "preference.clipboard.window_settings.hints.edge_auto_hide",
            )}
            onChange={(value) => {
              clipboardStore.window.edgeAutoHide = value;
            }}
            title={t(
              "preference.clipboard.window_settings.label.edge_auto_hide",
            )}
            value={window.edgeAutoHide}
          />

          <AutoPaste />

          <ProSwitch
            description={t(
              "preference.clipboard.window_settings.hints.back_top",
            )}
            onChange={(value) => {
              clipboardStore.window.backTop = value;
            }}
            title={t("preference.clipboard.window_settings.label.back_top")}
            value={window.backTop}
          />

          <ProSwitch
            onChange={(value) => {
              clipboardStore.window.showAll = value;
            }}
            title={t("preference.clipboard.window_settings.label.show_all")}
            value={window.showAll}
          />

          <ProSwitch
            description={t(
              "preference.clipboard.window_settings.hints.link_open_prompt",
            )}
            onChange={(value) => {
              clipboardStore.window.linkOpenPrompt = value;
            }}
            title={t(
              "preference.clipboard.window_settings.label.link_open_prompt",
            )}
            value={window.linkOpenPrompt}
          />

          <ProSwitch
            description={t(
              "preference.clipboard.content_settings.hints.delete_confirm",
            )}
            onChange={(value) => {
              clipboardStore.content.deleteConfirm = value;
            }}
            title={t(
              "preference.clipboard.content_settings.label.delete_confirm",
            )}
            value={content.deleteConfirm}
          />
        </ProList>
      </div>

      <div
        className="mb-6 scroll-mt-14"
        ref={(el) => {
          if (el) sectionsRef.current.set("audio", el);
        }}
      >
        <AudioSettings />
      </div>

      <div
        className="mb-6 scroll-mt-14"
        ref={(el) => {
          if (el) sectionsRef.current.set("search", el);
        }}
      >
        <ProList header={t("preference.clipboard.search_box_settings.title")}>
          <SearchPosition />

          <ProSwitch
            description={t(
              "preference.clipboard.search_box_settings.hints.default_focus",
            )}
            onChange={(value) => {
              clipboardStore.search.defaultFocus = value;
            }}
            title={t(
              "preference.clipboard.search_box_settings.label.default_focus",
            )}
            value={search.defaultFocus}
          />

          <ProSwitch
            description={t(
              "preference.clipboard.search_box_settings.hints.auto_clear",
            )}
            onChange={(value) => {
              clipboardStore.search.autoClear = value;
            }}
            title={t(
              "preference.clipboard.search_box_settings.label.auto_clear",
            )}
            value={search.autoClear}
          />
        </ProList>
      </div>

      <div
        className="mb-6 scroll-mt-14"
        ref={(el) => {
          if (el) sectionsRef.current.set("content", el);
        }}
      >
        <ProList header={t("preference.clipboard.content_settings.title")}>
          <ProSwitch
            description={t(
              "preference.clipboard.content_settings.hints.copy_as_plain",
            )}
            onChange={(value) => {
              clipboardStore.content.copyPlain = value;
            }}
            title={t(
              "preference.clipboard.content_settings.label.copy_as_plain",
            )}
            value={content.copyPlain}
          />

          <ProSwitch
            description={t(
              "preference.clipboard.content_settings.hints.paste_as_plain",
            )}
            onChange={(value) => {
              clipboardStore.content.pastePlain = value;
            }}
            title={t(
              "preference.clipboard.content_settings.label.paste_as_plain",
            )}
            value={content.pastePlain}
          />

          <ProSwitch
            description={t(
              "preference.clipboard.content_settings.hints.auto_favorite",
            )}
            onChange={(value) => {
              clipboardStore.content.autoFavorite = value;
            }}
            title={t(
              "preference.clipboard.content_settings.label.auto_favorite",
            )}
            value={content.autoFavorite}
          />

          <ProSwitch
            description={t(
              "preference.clipboard.content_settings.hints.auto_sort",
            )}
            onChange={(value) => {
              clipboardStore.content.autoSort = value;
            }}
            title={t("preference.clipboard.content_settings.label.auto_sort")}
            value={content.autoSort}
          />

          <ProSwitch
            description={t(
              "preference.clipboard.content_settings.hints.track_source",
            )}
            onChange={(value) => {
              clipboardStore.content.trackSource = value;
            }}
            title={t(
              "preference.clipboard.content_settings.label.track_source",
            )}
            value={content.trackSource}
          />
          <TagSettings />
          <ProSwitch
            description={t(
              "preference.clipboard.content_settings.hints.mask_sensitive",
            )}
            onChange={(value) => {
              clipboardStore.content.maskSensitive = value;
            }}
            title={t(
              "preference.clipboard.content_settings.label.mask_sensitive",
            )}
            value={content.maskSensitive}
          />
          <CleaningRules />
          <BlacklistApps />
        </ProList>
      </div>

      <div
        className="mb-6 scroll-mt-14"
        ref={(el) => {
          if (el) sectionsRef.current.set("list", el);
        }}
      >
        <ProList header={t("preference.clipboard.list_settings.title")}>
          <OperationButton />

          <ProSwitch
            description={t(
              "preference.clipboard.content_settings.hints.show_original_content",
            )}
            onChange={(value) => {
              clipboardStore.content.showOriginalContent = value;
            }}
            title={t(
              "preference.clipboard.content_settings.label.show_original_content",
            )}
            value={content.showOriginalContent}
          />

          <ProSwitch
            description={t(
              "preference.clipboard.content_settings.hints.show_char_count",
            )}
            onChange={(value) => {
              clipboardStore.content.showCharCount = value;
            }}
            title={t(
              "preference.clipboard.content_settings.label.show_char_count",
            )}
            value={content.showCharCount}
          />

          <ProSwitch
            description={t(
              "preference.clipboard.content_settings.hints.show_image_size",
            )}
            onChange={(value) => {
              clipboardStore.content.showImageSize = value;
            }}
            title={t(
              "preference.clipboard.content_settings.label.show_image_size",
            )}
            value={content.showImageSize}
          />
        </ProList>
      </div>

      <div
        className="mb-6 scroll-mt-14"
        ref={(el) => {
          if (el) sectionsRef.current.set("default-apps", el);
        }}
      >
        <DefaultApps />
      </div>
    </>
  );
};

export default ClipboardSettings;
