import { openUrl } from "@tauri-apps/plugin-opener";
import { Button, Flex, Tag, Typography } from "antd";
import { useTranslation } from "react-i18next";
import ProList from "@/components/ProList";
import ProListItem from "@/components/ProListItem";
import UnoIcon from "@/components/UnoIcon";

type ProjectCategory = "foundation" | "interface" | "ecosystem";
type ProjectRole =
  | "build"
  | "content"
  | "data"
  | "foundation"
  | "icons"
  | "runtime"
  | "ui";

interface OpenSourceProject {
  category: ProjectCategory;
  license: string;
  name: string;
  role: ProjectRole;
  url: string;
}

const CATEGORY_ICONS: Record<ProjectCategory, string> = {
  ecosystem: "i-lucide:blocks",
  foundation: "i-lucide:layers-3",
  interface: "i-lucide:palette",
};

const PROJECTS: OpenSourceProject[] = [
  {
    category: "foundation",
    license: "Apache-2.0",
    name: "EcoPaste",
    role: "foundation",
    url: "https://github.com/EcoPasteHub/EcoPaste",
  },
  {
    category: "foundation",
    license: "Apache-2.0 / MIT",
    name: "Tauri",
    role: "runtime",
    url: "https://github.com/tauri-apps/tauri",
  },
  {
    category: "foundation",
    license: "MIT",
    name: "React",
    role: "runtime",
    url: "https://github.com/facebook/react",
  },
  {
    category: "foundation",
    license: "Apache-2.0 / MIT",
    name: "Rust",
    role: "runtime",
    url: "https://github.com/rust-lang/rust",
  },
  {
    category: "foundation",
    license: "Apache-2.0",
    name: "TypeScript",
    role: "runtime",
    url: "https://github.com/microsoft/TypeScript",
  },
  {
    category: "interface",
    license: "MIT",
    name: "Ant Design",
    role: "ui",
    url: "https://github.com/ant-design/ant-design",
  },
  {
    category: "interface",
    license: "MIT",
    name: "TDesign React",
    role: "ui",
    url: "https://github.com/Tencent/tdesign-react",
  },
  {
    category: "interface",
    license: "MIT",
    name: "UnoCSS",
    role: "ui",
    url: "https://github.com/unocss/unocss",
  },
  {
    category: "interface",
    license: "MIT / icon-set licenses",
    name: "Iconify",
    role: "icons",
    url: "https://github.com/iconify/iconify",
  },
  {
    category: "ecosystem",
    license: "MIT",
    name: "Vite",
    role: "build",
    url: "https://github.com/vitejs/vite",
  },
  {
    category: "ecosystem",
    license: "MIT",
    name: "ahooks",
    role: "ui",
    url: "https://github.com/alibaba/hooks",
  },
  {
    category: "ecosystem",
    license: "MIT",
    name: "Valtio",
    role: "data",
    url: "https://github.com/pmndrs/valtio",
  },
  {
    category: "ecosystem",
    license: "MIT",
    name: "Kysely",
    role: "data",
    url: "https://github.com/kysely-org/kysely",
  },
  {
    category: "ecosystem",
    license: "MIT",
    name: "Day.js",
    role: "data",
    url: "https://github.com/iamkun/dayjs",
  },
  {
    category: "ecosystem",
    license: "Apache-2.0 / MPL-2.0",
    name: "DOMPurify",
    role: "content",
    url: "https://github.com/cure53/DOMPurify",
  },
  {
    category: "ecosystem",
    license: "MIT",
    name: "React Virtuoso",
    role: "ui",
    url: "https://github.com/petyosi/react-virtuoso",
  },
];

const CATEGORIES: ProjectCategory[] = ["foundation", "interface", "ecosystem"];

const Acknowledgements = () => {
  const { t } = useTranslation();

  return (
    <Flex gap="middle" vertical>
      <div>
        <Typography.Title className="mb-1!" level={4}>
          {t("preference.acknowledgements.title")}
        </Typography.Title>
        <Typography.Paragraph className="mb-0!" type="secondary">
          {t("preference.acknowledgements.description")}
        </Typography.Paragraph>
      </div>

      {CATEGORIES.map((category) => (
        <ProList
          header={t(`preference.acknowledgements.category.${category}`)}
          key={category}
        >
          {PROJECTS.filter((project) => project.category === category).map(
            (project) => (
              <ProListItem
                avatar={
                  <Flex
                    align="center"
                    className="h-10 w-10 rounded-lg bg-color-3 text-primary"
                    justify="center"
                  >
                    <UnoIcon name={CATEGORY_ICONS[category]} size={20} />
                  </Flex>
                }
                description={
                  <Flex align="center" gap="small" wrap>
                    <span>
                      {t(`preference.acknowledgements.role.${project.role}`)}
                    </span>
                    <Tag bordered={false}>{project.license}</Tag>
                  </Flex>
                }
                key={project.name}
                title={project.name}
              >
                <Button
                  icon={<UnoIcon name="i-lucide:external-link" />}
                  onClick={() => void openUrl(project.url)}
                >
                  {t("preference.acknowledgements.view_project")}
                </Button>
              </ProListItem>
            ),
          )}
        </ProList>
      ))}

      <Typography.Paragraph className="px-1" type="secondary">
        {t("preference.acknowledgements.notice")}
      </Typography.Paragraph>
    </Flex>
  );
};

export default Acknowledgements;
