import { useState } from "react";
import { Layers } from "lucide-react";
import { FormField } from "@/components/auth/FormField";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { ServerError } from "@/components/auth/ServerError";
import type { GearItem } from "@/lib/types";

interface Props {
  action: string;
  availableItems: GearItem[];
  initialValues?: { name?: string };
  selectedItemIds?: string[];
  serverError?: string | null;
}

export default function GearSetForm({ action, availableItems, initialValues, selectedItemIds, serverError }: Props) {
  const [name, setName] = useState(initialValues?.name ?? "");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(selectedItemIds ?? []));
  const [errors, setErrors] = useState<{ name?: string; items?: string }>({});

  function validate() {
    const next: typeof errors = {};
    if (!name.trim()) next.name = "Name is required";
    if (selectedIds.size === 0) next.items = "Select at least one gear item";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    if (!validate()) e.preventDefault();
  }

  function toggleItem(id: string, checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
    if (errors.items) setErrors((prev) => ({ ...prev, items: undefined }));
  }

  return (
    <form method="POST" action={action} className="space-y-4" onSubmit={handleSubmit} noValidate>
      <FormField
        id="name"
        label="Set Name"
        value={name}
        onChange={(v) => {
          setName(v);
          if (errors.name) setErrors((prev) => ({ ...prev, name: undefined }));
        }}
        placeholder="e.g. Longsword Tournament Kit"
        error={errors.name}
        icon={<Layers className="size-4" />}
      />

      <div>
        <p className="mb-2 text-sm text-blue-100/80">Gear Items</p>
        <div className="space-y-2 rounded-lg border border-white/10 bg-white/5 p-3">
          {availableItems.map((item) => (
            <label key={item.id} className="flex cursor-pointer items-center gap-3">
              <input
                type="checkbox"
                name="item_ids"
                value={item.id}
                checked={selectedIds.has(item.id)}
                onChange={(e) => {
                  toggleItem(item.id, e.target.checked);
                }}
                className="size-4 rounded accent-purple-500"
              />
              <span className="text-sm text-white">
                {item.name}
                <span className="ml-1.5 text-blue-100/50">({item.category})</span>
              </span>
            </label>
          ))}
        </div>
        {errors.items && <p className="mt-1 flex items-center gap-1 text-xs text-red-300">{errors.items}</p>}
      </div>

      <ServerError message={serverError} />

      <SubmitButton pendingText="Saving…" icon={<Layers className="size-4" />}>
        Save gear set
      </SubmitButton>
    </form>
  );
}
