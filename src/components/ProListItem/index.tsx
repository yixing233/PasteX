import { List } from "antd";
import type { ListItemMetaProps, ListItemProps } from "antd/es/list";
import { Children, type FC } from "react";

type ProListItemProps = ListItemMetaProps & {
  itemClassName?: ListItemProps["className"];
};

const ProListItem: FC<ProListItemProps> = (props) => {
  const { children, itemClassName, ...rest } = props;

  return (
    <List.Item actions={Children.toArray(children)} className={itemClassName}>
      <List.Item.Meta {...rest} />
    </List.Item>
  );
};

export default ProListItem;
