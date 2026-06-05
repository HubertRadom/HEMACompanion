import { useState } from "react";
import { Tag, Building2, Hash } from "lucide-react";
import { FormField } from "@/components/auth/FormField";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { ServerError } from "@/components/auth/ServerError";
import { GEAR_CATEGORIES } from "@/lib/gear-categories";
import type { GearItem } from "@/lib/types";

interface Props {
  action: string;
  initialValues?: Partial<GearItem>;
  serverError?: string | null;
}

export default function GearItemForm({ action, initialValues, serverError }: Props) {
  const [name, setName] = useState(initialValues?.name ?? "");
  const [category, setCategory] = useState(initialValues?.category ?? "");
  const [brand, setBrand] = useState(initialValues?.brand ?? "");
  const [model, setModel] = useState(initialValues?.model ?? "");
  const [errors, setErrors] = useState<{ name?: string; category?: string }>({});

  function validate() {
    const next: typeof errors = {};
    if (!name.trim()) next.name = "Name is required";
    if (!category) next.category = "Category is required";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    if (!validate()) e.preventDefault();
  }

  return (
    <form method="POST" action={action} className="space-y-4" onSubmit={handleSubmit} noValidate>
      <FormField
        id="name"
        label="Name"
        value={name}
        onChange={(v) => {
          setName(v);
          if (errors.name) setErrors((prev) => ({ ...prev, name: undefined }));
        }}
        placeholder="e.g. Albion Meyer"
        error={errors.name}
        icon={<Tag className="size-4" />}
      />

      <div>
        <label htmlFor="category" className="mb-1 block text-sm text-blue-100/80">
          Category
        </label>
        <select
          id="category"
          name="category"
          value={category}
          onChange={(e) => {
            setCategory(e.target.value);
            if (errors.category) setErrors((prev) => ({ ...prev, category: undefined }));
          }}
          className={`w-full rounded-lg border bg-white/10 px-3 py-2 text-white transition-colors focus:ring-2 focus:outline-none [&>option]:bg-slate-800 ${
            errors.category ? "border-red-400/60 focus:ring-red-400" : "border-white/20 focus:ring-purple-400"
          }`}
        >
          <option value="">Select a category…</option>
          {GEAR_CATEGORIES.map((cat) => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </select>
        {errors.category && <p className="mt-1 flex items-center gap-1 text-xs text-red-300">{errors.category}</p>}
      </div>

      <FormField
        id="brand"
        label="Brand (optional)"
        value={brand}
        onChange={setBrand}
        placeholder="e.g. Albion"
        icon={<Building2 className="size-4" />}
      />

      <FormField
        id="model"
        label="Model (optional)"
        value={model}
        onChange={setModel}
        placeholder="e.g. Meyer"
        icon={<Hash className="size-4" />}
      />

      <ServerError message={serverError} />

      <SubmitButton pendingText="Saving…" icon={<Tag className="size-4" />}>
        Save gear item
      </SubmitButton>
    </form>
  );
}
