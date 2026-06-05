import { useState } from "react";
import { User, Calendar, Swords } from "lucide-react";
import { FormField } from "@/components/auth/FormField";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { ServerError } from "@/components/auth/ServerError";
import type { GearSet } from "@/lib/types";

const WEAPON_OPTIONS = [
  { value: "longsword", label: "Longsword" },
  { value: "sabre", label: "Sabre" },
  { value: "rapier", label: "Rapier" },
  { value: "other", label: "Other" },
];

const RESULT_OPTIONS = [
  { value: "win", label: "Win" },
  { value: "loss", label: "Loss" },
  { value: "draw", label: "Draw" },
];

const selectClass =
  "w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-white transition-colors focus:ring-2 focus:ring-purple-400 focus:outline-none [&>option]:bg-slate-800";

interface Props {
  action: string;
  gearSets: GearSet[];
  initialValues?: {
    opponent_name?: string;
    weapon_category?: string;
    result?: string;
    date?: string;
    gear_set_id?: string | null;
  };
  serverError?: string | null;
}

export default function FightForm({ action, gearSets, initialValues, serverError }: Props) {
  const today = new Date().toISOString().slice(0, 10);
  const [opponentName, setOpponentName] = useState(initialValues?.opponent_name ?? "");
  const [weaponCategory, setWeaponCategory] = useState(initialValues?.weapon_category ?? "longsword");
  const [result, setResult] = useState(initialValues?.result ?? "win");
  const [date, setDate] = useState(initialValues?.date ?? today);
  const [gearSetId, setGearSetId] = useState(initialValues?.gear_set_id ?? "");
  const [errors, setErrors] = useState<{ opponent_name?: string; date?: string }>({});

  function validate() {
    const next: typeof errors = {};
    if (!opponentName.trim()) next.opponent_name = "Opponent name is required";
    if (!date) next.date = "Date is required";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    if (!validate()) e.preventDefault();
  }

  return (
    <form method="POST" action={action} className="space-y-4" onSubmit={handleSubmit} noValidate>
      <FormField
        id="opponent_name"
        label="Opponent"
        value={opponentName}
        onChange={(v) => {
          setOpponentName(v);
          if (errors.opponent_name) setErrors((prev) => ({ ...prev, opponent_name: undefined }));
        }}
        placeholder="e.g. Jan Kowalski"
        error={errors.opponent_name}
        icon={<User className="size-4" />}
      />

      <div>
        <label htmlFor="weapon_category" className="mb-1 block text-sm text-blue-100/80">
          Weapon Category
        </label>
        <select
          id="weapon_category"
          name="weapon_category"
          value={weaponCategory}
          onChange={(e) => {
            setWeaponCategory(e.target.value);
          }}
          className={selectClass}
        >
          {WEAPON_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="result" className="mb-1 block text-sm text-blue-100/80">
          Result
        </label>
        <select
          id="result"
          name="result"
          value={result}
          onChange={(e) => {
            setResult(e.target.value);
          }}
          className={selectClass}
        >
          {RESULT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <FormField
        id="date"
        name="date"
        label="Date"
        type="date"
        value={date}
        onChange={(v) => {
          setDate(v);
          if (errors.date) setErrors((prev) => ({ ...prev, date: undefined }));
        }}
        error={errors.date}
        icon={<Calendar className="size-4" />}
      />

      <div>
        <label htmlFor="gear_set_id" className="mb-1 block text-sm text-blue-100/80">
          Gear Set <span className="text-blue-100/40">(optional)</span>
        </label>
        {gearSets.length === 0 ? (
          <div>
            <select
              id="gear_set_id"
              name="gear_set_id"
              disabled
              className="w-full cursor-not-allowed rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white/30"
            >
              <option>No gear sets — create one first</option>
            </select>
            <p className="mt-1 text-xs text-blue-100/50">
              <a href="/gear-sets/add" className="underline hover:text-white">
                Create a gear set
              </a>{" "}
              to associate it with fights.
            </p>
          </div>
        ) : (
          <select
            id="gear_set_id"
            name="gear_set_id"
            value={gearSetId}
            onChange={(e) => {
              setGearSetId(e.target.value);
            }}
            className={selectClass}
          >
            <option value="">No gear set</option>
            {gearSets.map((set) => (
              <option key={set.id} value={set.id}>
                {set.name}
              </option>
            ))}
          </select>
        )}
      </div>

      <ServerError message={serverError} />

      <SubmitButton pendingText="Saving…" icon={<Swords className="size-4" />}>
        Save fight
      </SubmitButton>
    </form>
  );
}
