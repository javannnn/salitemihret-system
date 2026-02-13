import { Input, Button } from "@/components/ui";

export type DateRangeValue = {
    start: string;
    end: string;
};

export function DateRangeControls({
    value,
    onChange,
    label = "Date range",
}: {
    value: DateRangeValue;
    onChange: (next: DateRangeValue) => void;
    label?: string;
}) {
    const hasValue = Boolean(value.start || value.end);

    return (
        <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[140px]">
                <label className="text-[11px] uppercase tracking-wide text-muted block mb-1">{label} from</label>
                <Input
                    type="date"
                    value={value.start}
                    onChange={(event) => onChange({ ...value, start: event.target.value })}
                />
            </div>
            <div className="min-w-[140px]">
                <label className="text-[11px] uppercase tracking-wide text-muted block mb-1">{label} to</label>
                <Input
                    type="date"
                    value={value.end}
                    onChange={(event) => onChange({ ...value, end: event.target.value })}
                />
            </div>
            <Button variant="ghost" className="h-9 px-3 text-xs" disabled={!hasValue} onClick={() => onChange({ start: "", end: "" })}>
                Clear
            </Button>
        </div>
    );
}
