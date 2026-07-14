import { createHashRouter } from "react-router-dom";
import LinkOpenPrompt from "@/pages/LinkOpenPrompt";
import Main from "@/pages/Main";
import Preference from "@/pages/Preference";

export const router = createHashRouter([
  {
    Component: Main,
    path: "/",
  },
  {
    Component: Preference,
    path: "/preference",
  },
  {
    Component: LinkOpenPrompt,
    path: "/link-open-prompt",
  },
]);
