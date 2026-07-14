import { useBoolean } from "ahooks";
import { Form, Input, type InputRef, Modal } from "antd";
import { find } from "es-toolkit/compat";
import { t } from "i18next";
import {
  forwardRef,
  useContext,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { updateHistory } from "@/database/history";
import { MainContext } from "@/pages/Main";
import type { DatabaseSchemaHistory } from "@/types/database";

export interface EditModalRef {
  open: (id: string) => void;
}

interface FormFields {
  value: string;
}

const EditModal = forwardRef<EditModalRef>((_, ref) => {
  const { rootState } = useContext(MainContext);
  const [open, { toggle }] = useBoolean();
  const [item, setItem] = useState<DatabaseSchemaHistory>();
  const [form] = Form.useForm<FormFields>();
  const inputRef = useRef<InputRef>(null);

  useImperativeHandle(ref, () => ({
    open: (id) => {
      const findItem = find(rootState.list, { id });

      form.setFieldsValue({
        value: findItem?.value as string,
      });

      setItem(findItem);

      toggle();
    },
  }));

  const handleOk = async () => {
    const { value } = form.getFieldsValue();

    if (item && item.value !== value) {
      item.value = value;
      item.edited = true;
      item.count = value.length;

      await updateHistory(item.id, {
        count: value.length,
        edited: true,
        value,
      });
    }

    toggle();
  };

  const handleAfterOpenChange = (open: boolean) => {
    if (!open) return;

    inputRef.current?.focus();
  };

  return (
    <Modal
      afterOpenChange={handleAfterOpenChange}
      centered
      forceRender
      onCancel={toggle}
      onOk={handleOk}
      open={open}
      title={t(
        "preference.clipboard.content_settings.label.operation_button_option.edit",
      )}
    >
      <Form
        form={form}
        initialValues={{ value: item?.value as string }}
        onFinish={handleOk}
      >
        <Form.Item className="mb-0!" name="value">
          <Input.TextArea
            autoSize={{ maxRows: 10, minRows: 4 }}
            placeholder={t("clipboard.hints.search_placeholder")}
            ref={inputRef}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
});

export default EditModal;
