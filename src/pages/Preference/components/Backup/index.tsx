import { useReactive } from "ahooks";
import { Spin } from "antd";
import Manual from "../Shared/Manual";
import SavePath from "../Shared/SavePath";

export interface State {
  spinning: boolean;
}

const Backup = () => {
  const state = useReactive<State>({
    spinning: false,
  });

  return (
    <>
      <Spin fullscreen percent="auto" spinning={state.spinning} />

      <SavePath state={state} />

      <Manual state={state} />
    </>
  );
};

export default Backup;
