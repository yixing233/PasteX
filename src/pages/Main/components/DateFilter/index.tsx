import { Flex, InputNumber, Popover } from "antd";
import clsx from "clsx";
import type { Dayjs } from "dayjs";
import dayjs from "dayjs";
import { type FC, useContext, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { DateMultipleValue, DateValue } from "tdesign-react";
import { DatePicker } from "tdesign-react";

import UnoIcon from "@/components/UnoIcon";
import { MainContext } from "../..";

const DateFilter: FC = () => {
  const { rootState } = useContext(MainContext);
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [startDate, setStartDate] = useState<Dayjs | null>(null);
  const [endDate, setEndDate] = useState<Dayjs | null>(null);
  const [startHour, setStartHour] = useState<number | null>(null);
  const [endHour, setEndHour] = useState<number | null>(null);

  const isActive = !!rootState.dateRange;

  const lastDateRange = useRef(rootState.dateRange);

  if (rootState.dateRange) {
    lastDateRange.current = rootState.dateRange;
  }

  const displayDateRange = rootState.dateRange ||
    lastDateRange.current || [dayjs().toISOString(), dayjs().toISOString()];

  const applyFilter = (
    sDate: Dayjs | null,
    eDate: Dayjs | null,
    sHour: number | null,
    eHour: number | null,
  ) => {
    if (!sDate) {
      rootState.dateRange = undefined;
      return;
    }

    const actualEnd = eDate ?? sDate;

    const start = sDate
      .hour(sHour ?? 0)
      .minute(0)
      .second(0);
    const end = actualEnd
      .hour(eHour ?? 23)
      .minute(59)
      .second(59);

    rootState.dateRange = [
      start.format("YYYY-MM-DD HH:mm:ss"),
      end.format("YYYY-MM-DD HH:mm:ss"),
    ];
  };

  const handleStartDateChange = (value: DateValue | DateMultipleValue) => {
    if (Array.isArray(value)) return;
    const date = value ? dayjs(value) : null;
    setStartDate(date);
    applyFilter(date, endDate, startHour, endHour);
  };

  const handleEndDateChange = (value: DateValue | DateMultipleValue) => {
    if (Array.isArray(value)) return;
    const date = value ? dayjs(value) : null;
    setEndDate(date);
    applyFilter(startDate, date, startHour, endHour);
  };

  const handleStartHourChange = (value: number | null) => {
    setStartHour(value);
    if (startDate) {
      applyFilter(startDate, endDate, value, endHour);
    }
  };

  const handleEndHourChange = (value: number | null) => {
    setEndHour(value);
    if (startDate) {
      applyFilter(startDate, endDate, startHour, value);
    }
  };

  const handleClear = () => {
    setStartDate(null);
    setEndDate(null);
    setStartHour(null);
    setEndHour(null);
    rootState.dateRange = undefined;
    setOpen(false);
  };

  const content = (
    <Flex className="w-52" gap={8} vertical>
      <DatePicker
        allowInput
        className="w-full"
        clearable={false}
        onChange={handleStartDateChange}
        placeholder={t("clipboard.filter.start_date")}
        popupProps={{ attach: () => document.body }}
        value={startDate?.format("YYYY-MM-DD")}
      />

      <DatePicker
        allowInput
        className="w-full"
        clearable
        disableDate={(current: DateValue) => {
          if (!startDate) return false;
          return dayjs(current).isBefore(startDate, "day");
        }}
        disabled={!startDate}
        onChange={handleEndDateChange}
        placeholder={t("clipboard.filter.end_date")}
        popupProps={{ attach: () => document.body }}
        value={endDate?.format("YYYY-MM-DD")}
      />

      <Flex gap={8}>
        <InputNumber
          className="flex-1"
          disabled={!startDate}
          max={23}
          min={0}
          onChange={handleStartHourChange}
          placeholder={t("clipboard.filter.start_hour")}
          value={startHour}
        />
        <InputNumber
          className="flex-1"
          disabled={!startDate}
          max={23}
          min={0}
          onChange={handleEndHourChange}
          placeholder={t("clipboard.filter.end_hour")}
          value={endHour}
        />
      </Flex>

      {isActive && (
        <span
          className="cursor-pointer text-center text-primary text-xs"
          onClick={handleClear}
        >
          {t("clipboard.filter.clear")}
        </span>
      )}
    </Flex>
  );

  return (
    <Popover
      content={content}
      onOpenChange={setOpen}
      open={open}
      placement="bottomRight"
      title={t("clipboard.filter.title")}
      trigger="click"
    >
      <Flex align="center" className="shrink-0 cursor-pointer">
        <div
          className={clsx(
            "grid overflow-hidden transition-[grid-template-columns,opacity] duration-300 ease-in-out",
            isActive
              ? "grid-cols-[1fr] opacity-100"
              : "grid-cols-[0fr] opacity-0",
          )}
        >
          <Flex align="center" className="min-w-0 overflow-hidden" gap={4}>
            <span
              className="truncate rounded bg-blue-50 px-2 py-0.5 text-blue-600 text-xs dark:bg-blue-500/15 dark:text-blue-400"
              title={`${dayjs(displayDateRange[0]).format("MM/DD HH:mm")} ~ ${dayjs(displayDateRange[1]).format("MM/DD HH:mm")}`}
            >
              {t("clipboard.filter.range", {
                end: dayjs(displayDateRange[1]).format("MM/DD HH:mm"),
                start: dayjs(displayDateRange[0]).format("MM/DD HH:mm"),
              })}
            </span>
            <UnoIcon
              className="cursor-pointer text-gray-400 text-sm transition hover:text-red-500 dark:text-gray-500 dark:hover:text-red-400"
              name="i-lucide:x"
              onClick={(e) => {
                e.stopPropagation();
                handleClear();
              }}
            />
          </Flex>
        </div>

        <div
          className={clsx(
            "grid overflow-hidden transition-[grid-template-columns,opacity] duration-300 ease-in-out",
            !isActive
              ? "grid-cols-[1fr] opacity-100"
              : "grid-cols-[0fr] opacity-0",
          )}
        >
          <div className="overflow-hidden">
            <UnoIcon hoverable name="i-lucide:filter" />
          </div>
        </div>
      </Flex>
    </Popover>
  );
};

export default DateFilter;
