import { Flex } from "antd";
import clsx from "clsx";
import { type CSSProperties, type FC, useContext } from "react";
import { Marker } from "react-mark.js";
import { MainContext } from "@/pages/Main";
import type { DatabaseSchemaHistory } from "@/types/database";

const Text: FC<DatabaseSchemaHistory<"text">> = (props) => {
  const { value, subtype } = props;
  const { rootState } = useContext(MainContext);

  const renderMarker = () => {
    // Truncate extremely long strings to prevent React freezing during render
    // when using react-mark.js. 2000 chars is usually more than enough for a 4-line clamp.
    const displayValue =
      value.length > 2000 ? `${value.slice(0, 2000)}...` : value;
    return <Marker mark={rootState.search}>{displayValue}</Marker>;
  };

  const renderColor = () => {
    const className = "absolute rounded-full";
    const style: CSSProperties = {
      background: value,
    };

    return (
      <Flex align="center" gap="small">
        <div className="relative h-5.5 min-w-5.5">
          <span
            className={clsx(className, "inset-0 opacity-50")}
            style={style}
          />

          <span className={clsx(className, "inset-0.5")} style={style} />
        </div>

        {renderMarker()}
      </Flex>
    );
  };

  const renderContent = () => {
    if (subtype === "color") {
      return renderColor();
    }

    return renderMarker();
  };

  return <div className="line-clamp-4">{renderContent()}</div>;
};

export default Text;
