import { copyFile, exists, remove } from "@tauri-apps/plugin-fs";
import { useAsyncEffect, useReactive } from "ahooks";
import { isString } from "es-toolkit";
import { unionBy } from "es-toolkit/compat";
import { sql } from "kysely";
import { useContext, useRef } from "react";
import { getDefaultSaveImagePath } from "tauri-plugin-clipboard-x-api";
import { LISTEN_KEY } from "@/constants";
import { selectHistory } from "@/database/history";
import { MainContext } from "@/pages/Main";
import { isBlank } from "@/utils/is";
import { getSaveImagePath, join } from "@/utils/path";
import { useTauriListen } from "./useTauriListen";

interface Options {
  scrollToTop: () => void;
}

export const useHistoryList = (options: Options) => {
  const { scrollToTop } = options;
  const { rootState } = useContext(MainContext);
  const state = useReactive({
    loading: false,
    noMore: false,
    page: 1,
    size: 20,
  });

  const requestRef = useRef(0);

  const fetchData = async () => {
    // 如果是加载更多（非第一页），且正在加载中，则跳过
    if (state.page > 1 && state.loading) return;

    const requestId = ++requestRef.current;

    try {
      state.loading = true;

      const { page } = state;

      const list = await selectHistory((qb) => {
        const { size } = state;
        const { group, search, dateRange, sourceFilter, tagFilters } =
          rootState;
        const isFavoriteGroup = group === "favorite";
        const isNormalGroup = group !== "all" && !isFavoriteGroup;

        return qb
          .$if(isFavoriteGroup, (eb) => eb.where("favorite", "=", true))
          .$if(isNormalGroup, (eb) => eb.where("group", "=", group))
          .$if(!isBlank(search), (eb) => {
            return eb.where((eb) => {
              return eb.or([
                eb("search", "like", eb.val(`%${search}%`)),
                eb("note", "like", eb.val(`%${search}%`)),
                eb("source", "like", eb.val(`%${search}%`)),
              ]);
            });
          })
          .$if(!isBlank(sourceFilter), (eb) =>
            eb.where("source", "like", `%${sourceFilter}%`),
          )
          .$if(tagFilters.length > 0, (eb) => {
            return tagFilters.reduce(
              (next, tagId) =>
                next.where(
                  sql<boolean>`instr(coalesce(tags, '[]'), ${`"${tagId}"`}) > 0`,
                ),
              eb,
            );
          })
          .$if(!!dateRange, (eb) => {
            return eb
              .where("createTime", ">=", dateRange![0])
              .where("createTime", "<=", dateRange![1]);
          })
          .offset((page - 1) * size)
          .limit(size)
          .orderBy("createTime", "desc");
      });

      // 如果请求ID不匹配，说明有新的请求发起，当前请求结果丢弃
      if (requestId !== requestRef.current) return;

      const defaultImagePath = await getDefaultSaveImagePath();
      const saveImagePath = getSaveImagePath();

      await Promise.all(
        list.map(async (item) => {
          const { type, value } = item;

          if (!isString(value)) return;

          if (type === "image") {
            // skip absolute path
            if (/^([a-zA-Z]:\\|\/)/.test(value)) return;

            const oldPath = join(saveImagePath, value);
            const newPath = join(defaultImagePath, value);

            if (await exists(oldPath)) {
              await copyFile(oldPath, newPath);

              remove(oldPath);
            }

            item.value = newPath;
          }

          if (type === "files") {
            item.value = JSON.parse(value);
          }
        }),
      );

      state.noMore = list.length === 0;

      if (page === 1) {
        rootState.list = list;

        if (state.noMore) return;

        return scrollToTop();
      }

      rootState.list = unionBy(rootState.list, list, "id");
    } finally {
      // 只有最新的请求才能重置 loading 状态
      if (requestId === requestRef.current) {
        state.loading = false;
      }
    }
  };

  const reload = () => {
    state.page = 1;
    state.noMore = false;

    return fetchData();
  };

  const loadMore = () => {
    if (state.noMore || state.loading) return;

    state.page += 1;

    fetchData();
  };

  useTauriListen(LISTEN_KEY.REFRESH_CLIPBOARD_LIST, reload);

  useAsyncEffect(async () => {
    await reload();

    rootState.activeId = rootState.list[0]?.id;
  }, [
    rootState.group,
    rootState.search,
    rootState.dateRange,
    rootState.sourceFilter,
    rootState.tagFilters,
  ]);

  return {
    loadMore,
    reload,
  };
};
