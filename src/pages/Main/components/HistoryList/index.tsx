import { useThrottleFn, useUpdateEffect } from "ahooks";
import { FloatButton, Modal } from "antd";
import clsx from "clsx";
import { findIndex } from "es-toolkit/compat";
import { useContext, useEffect, useRef, useState } from "react";
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";
import Scrollbar from "@/components/Scrollbar";
import UnoIcon from "@/components/UnoIcon";
import { LISTEN_KEY } from "@/constants";
import { useHistoryList } from "@/hooks/useHistoryList";
import { useKeyboard } from "@/hooks/useKeyboard";
import { useTauriListen } from "@/hooks/useTauriListen";
import { MainContext } from "../..";
import EditModal, { type EditModalRef } from "./components/EditModal";
import Item from "./components/Item";
import NoteModal, { type NoteModalRef } from "./components/NoteModal";

const HistoryList = () => {
  const { rootState } = useContext(MainContext);
  const noteModelRef = useRef<NoteModalRef>(null);
  const editModalRef = useRef<EditModalRef>(null);
  const [deleteModal, contextHolder] = Modal.useModal();
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [isScrollingUp, setIsScrollingUp] = useState(false);
  const prevScrollTop = useRef(0);

  const { run: handleScroll } = useThrottleFn(
    (scrollTop: number) => {
      setIsScrollingUp((prev) => {
        if (scrollTop < prevScrollTop.current && !prev) {
          return true;
        }
        if (scrollTop > prevScrollTop.current && prev) {
          return false;
        }
        return prev;
      });

      prevScrollTop.current = scrollTop;
    },
    { wait: 150 },
  );

  const onScroll = (e: React.UIEvent<HTMLElement>) => {
    const scrollTop = e.currentTarget?.scrollTop;

    if (typeof scrollTop !== "number") return;

    handleScroll(scrollTop);
  };

  const scrollToIndex = (
    index: number,
    behavior: "auto" | "smooth" = "auto",
  ) => {
    return virtuosoRef.current?.scrollIntoView({ behavior, index });
  };

  const scrollToTop = () => {
    if (rootState.list.length === 0) return;

    scrollToIndex(0, "smooth");

    rootState.activeId = rootState.list[0].id;
  };

  useKeyboard({ scrollToTop });

  const { reload, loadMore } = useHistoryList({ scrollToTop });

  useTauriListen(LISTEN_KEY.ACTIVATE_BACK_TOP, scrollToTop);

  useUpdateEffect(() => {
    const { list } = rootState;

    if (list.length === 0) {
      rootState.activeId = void 0;
    } else {
      rootState.activeId ??= list[0].id;
    }
  }, [rootState.list.length]);

  useEffect(() => {
    const { list, activeId } = rootState;

    if (!activeId) return;

    const index = findIndex(list, { id: activeId });

    if (index < 0) return;

    scrollToIndex(index);
  }, [rootState.activeId]);

  return (
    <>
      <Scrollbar
        className="flex-1"
        offsetX={3}
        onScroll={onScroll}
        ref={scrollerRef}
      >
        <Virtuoso
          atTopStateChange={(atTop) => {
            if (!atTop || rootState.list.length <= 20) return;

            reload();
          }}
          computeItemKey={(_, item) => item.id}
          customScrollParent={scrollerRef.current ?? void 0}
          data={rootState.list}
          endReached={loadMore}
          itemContent={(index, data) => {
            return (
              <div className={clsx({ "pt-3": index !== 0 })}>
                <Item
                  data={data}
                  deleteModal={deleteModal}
                  handleEdit={() => editModalRef.current?.open(data.id)}
                  handleNote={() => noteModelRef.current?.open(data.id)}
                  index={index}
                />
              </div>
            );
          }}
          overscan={500}
          ref={virtuosoRef}
        />
      </Scrollbar>

      <NoteModal ref={noteModelRef} />
      <EditModal ref={editModalRef} />

      <FloatButton.BackTop
        className="[&_.ant-float-btn-body]:!bg-white/50 [&_.ant-float-btn-body]:backdrop-blur-md"
        icon={
          <UnoIcon className="block text-xl" name="i-lucide:arrow-up-to-line" />
        }
        onClick={scrollToTop}
        target={() => scrollerRef.current!}
        visibilityHeight={isScrollingUp ? 400 : 99999}
      />

      {contextHolder}
    </>
  );
};

export default HistoryList;
