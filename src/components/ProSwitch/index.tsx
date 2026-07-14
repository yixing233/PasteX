import { Switch, type SwitchProps } from "antd";
import type { ListItemMetaProps } from "antd/es/list";
import type { FC } from "react";
import ProListItem from "../ProListItem";

type ProSwitchProps = SwitchProps &
  ListItemMetaProps & {
    itemClassName?: string;
  };

const ProSwitch: FC<ProSwitchProps> = (props) => {
  const { title, description, children, itemClassName, ...rest } = props;

  return (
    <ProListItem
      description={description}
      itemClassName={itemClassName}
      title={title}
    >
      <Switch {...rest} />

      {children}
    </ProListItem>
  );
};

export default ProSwitch;
