import { useCallback, useEffect, useMemo, useState } from "react";
import { useDropzone } from "react-dropzone";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Download,
  FileText,
  Info,
  Upload,
  XCircle,
} from "lucide-react";

import { Button, Card, Select } from "@/components/ui";
import { ApiError, ImportReport, importMembers } from "@/lib/api";
import { useToast } from "@/components/Toast";

type Props = {
  open: boolean;
  onClose: () => void;
  onComplete: (report: ImportReport) => void;
};

type WizardStep = "upload" | "mapping" | "review" | "results";

type CanonicalField = {
  key: string;
  label: string;
  required?: boolean;
};

type ParsedRow = {
  rowNumber: number;
  values: Record<string, string>;
};

const STEP_ORDER: WizardStep[] = ["upload", "mapping", "review", "results"];
const STEP_LABELS: Record<WizardStep, string> = {
  upload: "Upload",
  mapping: "Map Columns",
  review: "Review",
  results: "Results",
};

const FIELDS: CanonicalField[] = [
  { key: "username", label: "Username" },
  { key: "first_name", label: "First name", required: true },
  { key: "middle_name", label: "Middle name" },
  { key: "last_name", label: "Last name", required: true },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone", required: true },
  { key: "gender", label: "Gender" },
  { key: "status", label: "Status" },
  { key: "baptismal_name", label: "Baptismal name" },
  { key: "marital_status", label: "Marital status" },
  { key: "district", label: "District" },
  { key: "address", label: "Address" },
  { key: "address_street", label: "Address street" },
  { key: "address_city", label: "Address city" },
  { key: "address_region", label: "Address region" },
  { key: "address_postal_code", label: "Address postal code" },
  { key: "address_country", label: "Address country" },
  { key: "birth_date", label: "Birth date" },
  { key: "join_date", label: "Join date" },
  { key: "is_tither", label: "Is tither" },
  { key: "pays_contribution", label: "Pays contribution" },
  { key: "contribution_method", label: "Contribution method" },
  { key: "contribution_amount", label: "Contribution amount" },
  { key: "contribution_exception_reason", label: "Contribution exception reason" },
  { key: "notes", label: "Notes" },
  { key: "household", label: "Household" },
  { key: "household_size_override", label: "Household size override" },
  { key: "has_father_confessor", label: "Has father confessor" },
  { key: "father_confessor_name", label: "Father confessor" },
  { key: "tags", label: "Tags" },
  { key: "ministries", label: "Ministries" },
  { key: "spouse_first_name", label: "Spouse first name" },
  { key: "spouse_last_name", label: "Spouse last name" },
  { key: "spouse_gender", label: "Spouse gender" },
  { key: "spouse_country_of_birth", label: "Spouse country of birth" },
  { key: "spouse_phone", label: "Spouse phone" },
  { key: "spouse_email", label: "Spouse email" },
  { key: "children", label: "Children (First|Last|Gender|DOB|Country|Notes;...)" },
];

const HEADER_ALIASES: Record<string, string[]> = {
  username: ["username", "user_name"],
  first_name: ["first_name", "firstname", "given_name"],
  middle_name: ["middle_name", "middlename"],
  last_name: ["last_name", "lastname", "surname"],
  email: ["email"],
  phone: ["phone", "mobile", "mobile_phone"],
  gender: ["gender"],
  status: ["status"],
  baptismal_name: ["baptismal_name", "baptism_name"],
  marital_status: ["marital_status"],
  district: ["district"],
  address: ["address"],
  address_street: ["address_street", "street_address", "address_line1"],
  address_city: ["address_city", "city"],
  address_region: ["address_region", "state", "province", "region"],
  address_postal_code: ["address_postal_code", "postal_code", "zip", "zip_code"],
  address_country: ["address_country", "country"],
  birth_date: ["birth_date", "dob"],
  join_date: ["join_date", "membership_date"],
  is_tither: ["is_tither", "tither"],
  pays_contribution: ["pays_contribution", "membership_contributor", "give_membership_contribution"],
  contribution_method: ["contribution_method", "giving_method"],
  contribution_amount: ["contribution_amount", "giving_amount"],
  contribution_exception_reason: ["contribution_exception_reason", "exception_reason", "contribution_exception"],
  notes: ["notes"],
  household: ["household", "household_name"],
  household_size_override: ["household_size_override", "number_of_family", "family_count"],
  has_father_confessor: ["has_father_confessor", "father_confessor_flag"],
  father_confessor_name: ["father_confessor", "father_confessor_name"],
  tags: ["tags", "tag_list"],
  ministries: ["ministries", "ministry_list"],
  spouse_first_name: ["spouse_first_name"],
  spouse_last_name: ["spouse_last_name"],
  spouse_gender: ["spouse_gender"],
  spouse_country_of_birth: ["spouse_country_of_birth"],
  spouse_phone: ["spouse_phone"],
  spouse_email: ["spouse_email"],
  children: ["children", "child_list"],
};

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "_");
}

function splitCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      values.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  values.push(current);
  return values.map((value) => value.replace(/\r$/, ""));
}

function parseCsv(text: string): { headers: string[]; rows: ParsedRow[] } {
  const lines = text.split(/\r?\n/).map((line) => line.trimEnd());
  const headerLineIndex = lines.findIndex((line) => line.trim().length > 0);
  if (headerLineIndex === -1) {
    return { headers: [], rows: [] };
  }

  const headers = splitCsvLine(lines[headerLineIndex]);
  const rows: ParsedRow[] = [];

  for (let lineIndex = headerLineIndex + 1; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    if (!line || line.trim().length === 0) {
      continue;
    }
    const cells = splitCsvLine(line);
    const values: Record<string, string> = {};
    headers.forEach((header, index) => {
      values[header] = cells[index] ?? "";
    });
    rows.push({ rowNumber: lineIndex + 1, values });
  }

  return { headers, rows };
}

function buildCsv(rows: Record<string, string>[], headers: string[]): string {
  const escape = (value: string) => {
    const string = value ?? "";
    if (/[",\n]/.test(string)) {
      return `"${string.replace(/"/g, '""')}"`;
    }
    return string;
  };

  const headerLine = headers.map(escape).join(",");
  const dataLines = rows.map((row) => headers.map((header) => escape(row[header] ?? "")).join(","));
  return [headerLine, ...dataLines].join("\n");
}

function triggerCsvDownload(filename: string, csvContent: string): void {
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function inferMapping(headers: string[]): Record<string, string | ""> {
  return FIELDS.reduce<Record<string, string | "">>((acc, field) => {
    const aliases = HEADER_ALIASES[field.key] || [field.key];
    const match = headers.find((header) => aliases.some((alias) => normalizeHeader(alias) === normalizeHeader(header)));
    acc[field.key] = match ?? "";
    return acc;
  }, {});
}

export default function ImportWizard({ open, onClose, onComplete }: Props) {
  const toast = useToast();
  const [step, setStep] = useState<WizardStep>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [mapping, setMapping] = useState<Record<string, string | "">>(inferMapping([]));
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);

  const resetWizard = useCallback(() => {
    setStep("upload");
    setFile(null);
    setHeaders([]);
    setRows([]);
    setMapping(inferMapping([]));
    setUploading(false);
    setError(null);
    setReport(null);
  }, []);

  useEffect(() => {
    if (!open) {
      resetWizard();
    }
  }, [open, resetWizard]);

  const fieldLabelByKey = useMemo(() => {
    return FIELDS.reduce<Record<string, string>>((acc, field) => {
      acc[field.key] = field.label;
      return acc;
    }, {});
  }, []);

  const rowsByNumber = useMemo(() => {
    return rows.reduce<Map<number, ParsedRow>>((acc, row) => {
      acc.set(row.rowNumber, row);
      return acc;
    }, new Map<number, ParsedRow>());
  }, [rows]);

  const knownAliases = useMemo(() => {
    return new Set(
      Object.values(HEADER_ALIASES)
        .flat()
        .map((alias) => normalizeHeader(alias))
    );
  }, []);

  const duplicateHeaders = useMemo(() => {
    const counts = new Map<string, { original: string; count: number }>();
    headers.forEach((header) => {
      const normalized = normalizeHeader(header);
      const existing = counts.get(normalized);
      if (existing) {
        existing.count += 1;
      } else {
        counts.set(normalized, { original: header, count: 1 });
      }
    });
    return Array.from(counts.values()).filter((entry) => entry.count > 1);
  }, [headers]);

  const unknownHeaders = useMemo(
    () => headers.filter((header) => !knownAliases.has(normalizeHeader(header))),
    [headers, knownAliases]
  );

  const mappingCollisions = useMemo(() => {
    const assigned: Record<string, string[]> = {};
    Object.entries(mapping).forEach(([fieldKey, sourceHeader]) => {
      if (!sourceHeader) return;
      assigned[sourceHeader] = assigned[sourceHeader] ? [...assigned[sourceHeader], fieldKey] : [fieldKey];
    });
    return Object.entries(assigned)
      .filter(([, fieldKeys]) => fieldKeys.length > 1)
      .map(([header, fieldKeys]) => ({
        header,
        fields: fieldKeys.map((key) => fieldLabelByKey[key] || key),
      }));
  }, [mapping, fieldLabelByKey]);

  const requiredMissing = useMemo(
    () => FIELDS.filter((field) => field.required && !mapping[field.key]).map((field) => field.label),
    [mapping]
  );

  const mappedFields = useMemo(() => FIELDS.filter((field) => Boolean(mapping[field.key])), [mapping]);
  const previewRows = useMemo(() => rows.slice(0, 8), [rows]);

  const importReady = Boolean(file) && rows.length > 0 && requiredMissing.length === 0 && mappingCollisions.length === 0;

  const currentStepIndex = STEP_ORDER.indexOf(step);

  const downloadTemplate = useCallback(() => {
    const csv = buildCsv([], FIELDS.map((field) => field.key));
    triggerCsvDownload("members_import_template.csv", csv);
  }, []);

  const downloadFailureReport = useCallback(() => {
    if (!report || report.failed === 0) return;
    const failureHeaders = ["row", "reason", ...headers];
    const failureRows: Record<string, string>[] = report.errors.map((failure) => {
      const source = rowsByNumber.get(failure.row);
      const rowValues: Record<string, string> = {
        row: String(failure.row),
        reason: failure.reason,
      };
      headers.forEach((header) => {
        rowValues[header] = source?.values[header] ?? "";
      });
      return rowValues;
    });
    triggerCsvDownload("members_import_failures.csv", buildCsv(failureRows, failureHeaders));
  }, [headers, report, rowsByNumber]);

  const downloadSuccessReport = useCallback(() => {
    if (!report || !report.successes || report.successes.length === 0) return;
    const successHeaders = ["row", "action", "member_id", "username", "full_name"];
    const successRows = report.successes.map((item) => ({
      row: String(item.row),
      action: item.action,
      member_id: String(item.member_id),
      username: item.username,
      full_name: item.full_name,
    }));
    triggerCsvDownload("members_import_successes.csv", buildCsv(successRows, successHeaders));
  }, [report]);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (!acceptedFiles.length) return;
    const candidate = acceptedFiles[0];
    if (candidate.size > 5 * 1024 * 1024) {
      setError("CSV is too large. Maximum file size is 5MB.");
      return;
    }

    try {
      const text = await candidate.text();
      const { headers: parsedHeaders, rows: parsedRows } = parseCsv(text);

      if (parsedHeaders.length === 0) {
        setError("CSV header row is missing.");
        return;
      }

      setFile(candidate);
      setHeaders(parsedHeaders);
      setRows(parsedRows);
      setMapping(inferMapping(parsedHeaders));
      setReport(null);
      setError(null);
      setStep("upload");
    } catch (err) {
      console.error(err);
      setError("Failed to read CSV file. Ensure it is UTF-8 encoded.");
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: false,
    accept: {
      "text/csv": [".csv"],
    },
  });

  const handleImport = async () => {
    if (!file) {
      toast.push("Select a CSV before importing");
      return;
    }
    if (!importReady) {
      toast.push("Resolve mapping issues before importing");
      return;
    }

    setUploading(true);
    setError(null);

    try {
      const canonicalHeaders = FIELDS.map((field) => field.key);
      const normalizedRows = rows.map((row) => {
        const entry: Record<string, string> = {};
        FIELDS.forEach((field) => {
          const sourceHeader = mapping[field.key];
          entry[field.key] = sourceHeader ? row.values[sourceHeader] ?? "" : "";
        });
        return entry;
      });

      const normalizedCsv = buildCsv(normalizedRows, canonicalHeaders);
      const outputFile = new File([normalizedCsv], file.name, { type: "text/csv" });
      const result = await importMembers(outputFile);

      setReport(result);
      setStep("results");
      onComplete(result);
    } catch (err) {
      console.error(err);
      if (err instanceof ApiError) {
        setError(err.body || err.message || "Import failed");
      } else {
        setError("Import failed");
      }
      toast.push("Import failed. Review the error and try again.");
    } finally {
      setUploading(false);
    }
  };

  const handleClose = () => {
    if (uploading) return;
    onClose();
  };

  const moveNext = () => {
    const index = STEP_ORDER.indexOf(step);
    if (index < STEP_ORDER.length - 1) {
      setStep(STEP_ORDER[index + 1]);
    }
  };

  const moveBack = () => {
    const index = STEP_ORDER.indexOf(step);
    if (index > 0) {
      setStep(STEP_ORDER[index - 1]);
    }
  };

  const heading = file ? file.name : "Drop your CSV here";

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-40 bg-ink/40 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
          />
          <motion.div
            className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:p-6"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.18 }}
            role="dialog"
            aria-modal="true"
          >
            <Card className="w-full max-w-6xl max-h-[calc(100vh-2rem)] sm:max-h-[calc(100vh-3rem)] p-0 overflow-hidden flex flex-col">
              <div className="border-b border-border px-5 py-4 sm:px-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-semibold">Member import wizard</h2>
                    <p className="text-sm text-mute mt-1">
                      Upload CSV, map columns, validate issues, and import with a full success/failure report.
                    </p>
                  </div>
                  <Button variant="ghost" onClick={handleClose} disabled={uploading}>
                    Close
                  </Button>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  {STEP_ORDER.map((stepKey, index) => {
                    const complete = index < currentStepIndex;
                    const active = index === currentStepIndex;
                    return (
                      <div
                        key={stepKey}
                        className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${
                          active
                            ? "border-accent bg-accent/10 text-accent"
                            : complete
                              ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                              : "border-border text-mute"
                        }`}
                      >
                        <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-card text-[10px] font-semibold">
                          {index + 1}
                        </span>
                        <span>{STEP_LABELS[stepKey]}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto px-5 py-5 sm:px-6 sm:py-6 space-y-5">
                {step === "upload" && (
                  <>
                    <div
                      {...getRootProps()}
                      className="rounded-2xl border border-dashed border-border bg-card/60 px-6 py-10 text-center transition hover:border-accent/50 cursor-pointer"
                    >
                      <input {...getInputProps()} />
                      <Upload className="mx-auto h-10 w-10 text-accent" />
                      <p className="mt-3 text-sm font-medium">{heading}</p>
                      <p className="mt-1 text-xs text-mute">
                        {isDragActive ? "Drop CSV file here..." : "Drag & drop or click to browse (.csv, UTF-8, up to 5MB)."}
                      </p>
                    </div>

                    <div className="grid gap-4 lg:grid-cols-2">
                      <Card className="border border-border bg-card/70 p-4">
                        <div className="flex items-start gap-2">
                          <Info className="h-4 w-4 text-accent mt-0.5" />
                          <div className="text-sm text-ink">
                            <p className="font-semibold">Import format tips</p>
                            <p className="text-xs text-mute mt-1">
                              Required member fields: <code>first_name</code>, <code>last_name</code>, <code>phone</code>.
                              The wizard auto-maps common aliases and lets you correct mismatches.
                            </p>
                            <p className="text-xs text-mute mt-1">
                              Children format: <code>First|Last|Gender|YYYY-MM-DD|Country|Notes</code>, separated by <code>;</code>.
                            </p>
                          </div>
                        </div>
                      </Card>
                      <Card className="border border-border bg-card/70 p-4">
                        <div className="flex items-start gap-2">
                          <FileText className="h-4 w-4 text-accent mt-0.5" />
                          <div className="text-sm text-ink">
                            <p className="font-semibold">Need a starting template?</p>
                            <p className="text-xs text-mute mt-1">Download a clean CSV template with canonical member headers.</p>
                            <Button variant="ghost" className="mt-3" onClick={downloadTemplate}>
                              <Download className="h-4 w-4" />
                              Download template
                            </Button>
                          </div>
                        </div>
                      </Card>
                    </div>

                    {file && (
                      <Card className="border border-border bg-card/70 p-4">
                        <div className="grid gap-3 sm:grid-cols-3">
                          <div>
                            <p className="text-[11px] uppercase tracking-wide text-mute">File</p>
                            <p className="text-sm font-medium break-all">{file.name}</p>
                          </div>
                          <div>
                            <p className="text-[11px] uppercase tracking-wide text-mute">Rows detected</p>
                            <p className="text-sm font-medium">{rows.length}</p>
                          </div>
                          <div>
                            <p className="text-[11px] uppercase tracking-wide text-mute">Columns detected</p>
                            <p className="text-sm font-medium">{headers.length}</p>
                          </div>
                        </div>
                        {unknownHeaders.length > 0 && (
                          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                            Unrecognized headers found: {unknownHeaders.join(", ")}. Map them manually in the next step if needed.
                          </div>
                        )}
                        {duplicateHeaders.length > 0 && (
                          <div className="mt-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-900">
                            Duplicate headers found: {duplicateHeaders.map((header) => `${header.original} (x${header.count})`).join(", ")}.
                          </div>
                        )}
                        {rows.length === 0 && (
                          <div className="mt-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-900">
                            The file has headers but no data rows.
                          </div>
                        )}
                      </Card>
                    )}
                  </>
                )}

                {step === "mapping" && (
                  <div className="grid gap-5 xl:grid-cols-[2.2fr_1fr]">
                    <Card className="border border-border bg-card/70 p-4">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold">Map import fields</h3>
                        <Button
                          variant="ghost"
                          onClick={() => setMapping(inferMapping(headers))}
                          disabled={headers.length === 0}
                        >
                          Auto-map again
                        </Button>
                      </div>
                      <p className="mt-1 text-xs text-mute">
                        Assign each SaliteMihret field to the correct CSV header. Required fields must be mapped.
                      </p>
                      <div className="mt-4 max-h-[52vh] overflow-auto rounded-xl border border-border divide-y divide-border">
                        {FIELDS.map((field) => (
                          <div key={field.key} className="p-3 flex items-center justify-between gap-3">
                            <div>
                              <p className="text-sm font-medium text-ink">{field.label}</p>
                              {field.required && (
                                <p className="text-[11px] uppercase tracking-wide text-rose-600">Required</p>
                              )}
                            </div>
                            <Select
                              value={mapping[field.key]}
                              onChange={(event) =>
                                setMapping((prev) => ({
                                  ...prev,
                                  [field.key]: event.target.value,
                                }))
                              }
                              className="w-52"
                            >
                              <option value="">Not mapped</option>
                              {headers.map((header) => (
                                <option key={`${field.key}-${header}`} value={header}>
                                  {header}
                                </option>
                              ))}
                            </Select>
                          </div>
                        ))}
                      </div>
                    </Card>

                    <div className="space-y-4">
                      <Card className="border border-border bg-card/70 p-4">
                        <h3 className="text-sm font-semibold">Validation checks</h3>
                        <div className="mt-3 space-y-2 text-xs">
                          <div className={`rounded-lg px-3 py-2 ${requiredMissing.length ? "bg-rose-50 text-rose-900 border border-rose-200" : "bg-emerald-50 text-emerald-800 border border-emerald-200"}`}>
                            {requiredMissing.length
                              ? `Missing required mappings: ${requiredMissing.join(", ")}`
                              : "All required fields are mapped."}
                          </div>

                          <div className={`rounded-lg px-3 py-2 ${mappingCollisions.length ? "bg-rose-50 text-rose-900 border border-rose-200" : "bg-emerald-50 text-emerald-800 border border-emerald-200"}`}>
                            {mappingCollisions.length
                              ? `Mapped header conflicts detected (${mappingCollisions.length}).`
                              : "No duplicate header mappings."}
                          </div>

                          {mappingCollisions.length > 0 && (
                            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-rose-900">
                              {mappingCollisions.map((collision) => (
                                <p key={collision.header}>
                                  <strong>{collision.header}</strong>: {collision.fields.join(", ")}
                                </p>
                              ))}
                            </div>
                          )}

                          {unknownHeaders.length > 0 && (
                            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900">
                              Unknown CSV headers: {unknownHeaders.join(", ")}
                            </div>
                          )}
                        </div>
                      </Card>

                      <Card className="border border-border bg-card/70 p-4">
                        <h3 className="text-sm font-semibold">Coverage</h3>
                        <p className="mt-1 text-xs text-mute">Mapped {mappedFields.length} of {FIELDS.length} supported fields.</p>
                        <div className="mt-3 h-2 rounded-full bg-border/80 overflow-hidden">
                          <div
                            className="h-full bg-accent transition-all"
                            style={{ width: `${Math.round((mappedFields.length / FIELDS.length) * 100)}%` }}
                          />
                        </div>
                      </Card>
                    </div>
                  </div>
                )}

                {step === "review" && (
                  <div className="space-y-4">
                    <div className="grid gap-3 sm:grid-cols-4">
                      <Card className="border border-border bg-card/70 p-3">
                        <p className="text-[11px] uppercase tracking-wide text-mute">Rows to import</p>
                        <p className="text-lg font-semibold text-ink">{rows.length}</p>
                      </Card>
                      <Card className="border border-border bg-card/70 p-3">
                        <p className="text-[11px] uppercase tracking-wide text-mute">Mapped fields</p>
                        <p className="text-lg font-semibold text-ink">{mappedFields.length}</p>
                      </Card>
                      <Card className="border border-border bg-card/70 p-3">
                        <p className="text-[11px] uppercase tracking-wide text-mute">Unknown headers</p>
                        <p className="text-lg font-semibold text-ink">{unknownHeaders.length}</p>
                      </Card>
                      <Card className="border border-border bg-card/70 p-3">
                        <p className="text-[11px] uppercase tracking-wide text-mute">Failed checks</p>
                        <p className="text-lg font-semibold text-ink">{requiredMissing.length + mappingCollisions.length}</p>
                      </Card>
                    </div>

                    {(requiredMissing.length > 0 || mappingCollisions.length > 0) && (
                      <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
                        Resolve mapping issues before importing.
                      </div>
                    )}

                    <Card className="border border-border bg-card/70 p-4">
                      <h3 className="text-sm font-semibold">Data preview (first 8 rows)</h3>
                      <div className="mt-3 overflow-auto rounded-xl border border-border">
                        <table className="min-w-full text-xs">
                          <thead className="bg-card/80 text-mute uppercase tracking-wide">
                            <tr>
                              <th className="px-3 py-2 text-left">Row</th>
                              {mappedFields.map((field) => (
                                <th key={field.key} className="px-3 py-2 text-left">
                                  {field.label}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {previewRows.length === 0 ? (
                              <tr>
                                <td colSpan={mappedFields.length + 1} className="px-3 py-6 text-center text-mute">
                                  This file has no data rows.
                                </td>
                              </tr>
                            ) : (
                              previewRows.map((row) => (
                                <tr key={row.rowNumber} className="border-t border-border/70">
                                  <td className="px-3 py-2 font-medium text-mute">{row.rowNumber}</td>
                                  {mappedFields.map((field) => {
                                    const sourceHeader = mapping[field.key];
                                    return (
                                      <td key={`${row.rowNumber}-${field.key}`} className="px-3 py-2 whitespace-nowrap">
                                        {sourceHeader ? row.values[sourceHeader] : ""}
                                      </td>
                                    );
                                  })}
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </Card>
                  </div>
                )}

                {step === "results" && report && (
                  <div className="space-y-4">
                    <div className="grid gap-3 sm:grid-cols-3">
                      <Card className="border border-emerald-200 bg-emerald-50 p-4">
                        <p className="text-[11px] uppercase tracking-wide text-emerald-700">Inserted</p>
                        <p className="text-2xl font-semibold text-emerald-800">{report.inserted}</p>
                      </Card>
                      <Card className="border border-sky-200 bg-sky-50 p-4">
                        <p className="text-[11px] uppercase tracking-wide text-sky-700">Updated</p>
                        <p className="text-2xl font-semibold text-sky-800">{report.updated}</p>
                      </Card>
                      <Card className="border border-rose-200 bg-rose-50 p-4">
                        <p className="text-[11px] uppercase tracking-wide text-rose-700">Failed</p>
                        <p className="text-2xl font-semibold text-rose-800">{report.failed}</p>
                      </Card>
                    </div>

                    {report.failed === 0 ? (
                      <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4" />
                        Import completed with no row-level failures.
                      </div>
                    ) : (
                      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4" />
                        Import completed with failures. Review failed rows below and retry only those rows.
                      </div>
                    )}

                    <div className="grid gap-4 xl:grid-cols-2">
                      <Card className="border border-border bg-card/70 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <h3 className="text-sm font-semibold">Successful rows</h3>
                          <span className="text-xs text-mute">{report.successes?.length ?? report.inserted + report.updated} rows</span>
                        </div>
                        {!report.successes || report.successes.length === 0 ? (
                          <p className="mt-3 text-xs text-mute">This server returned summary counts only.</p>
                        ) : (
                          <div className="mt-3 max-h-72 overflow-auto rounded-xl border border-border">
                            <table className="min-w-full text-xs">
                              <thead className="bg-card/80 text-mute uppercase tracking-wide">
                                <tr>
                                  <th className="px-3 py-2 text-left">Row</th>
                                  <th className="px-3 py-2 text-left">Action</th>
                                  <th className="px-3 py-2 text-left">Member</th>
                                  <th className="px-3 py-2 text-left">Username</th>
                                </tr>
                              </thead>
                              <tbody>
                                {report.successes.map((success) => (
                                  <tr key={`${success.row}-${success.member_id}`} className="border-t border-border/70">
                                    <td className="px-3 py-2">{success.row}</td>
                                    <td className="px-3 py-2">{success.action}</td>
                                    <td className="px-3 py-2">{success.full_name || `Member #${success.member_id}`}</td>
                                    <td className="px-3 py-2">{success.username || "—"}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </Card>

                      <Card className="border border-border bg-card/70 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <h3 className="text-sm font-semibold">Failed rows</h3>
                          <span className="text-xs text-mute">{report.errors.length} rows</span>
                        </div>
                        {report.errors.length === 0 ? (
                          <p className="mt-3 text-xs text-mute">No failed rows.</p>
                        ) : (
                          <div className="mt-3 max-h-72 overflow-auto rounded-xl border border-border">
                            <table className="min-w-full text-xs">
                              <thead className="bg-card/80 text-mute uppercase tracking-wide">
                                <tr>
                                  <th className="px-3 py-2 text-left">Row</th>
                                  <th className="px-3 py-2 text-left">Reason</th>
                                </tr>
                              </thead>
                              <tbody>
                                {report.errors.map((failure) => (
                                  <tr key={`${failure.row}-${failure.reason}`} className="border-t border-border/70">
                                    <td className="px-3 py-2 font-medium text-rose-700">{failure.row}</td>
                                    <td className="px-3 py-2">{failure.reason}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </Card>
                    </div>
                  </div>
                )}

                {error && (
                  <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900 flex items-start gap-2">
                    <XCircle className="h-4 w-4 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}
              </div>

              <div className="border-t border-border bg-card/80 px-5 py-4 sm:px-6 flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs text-mute">
                  {step === "upload" && "Start by uploading your CSV file."}
                  {step === "mapping" && "Map required fields and resolve header issues before continuing."}
                  {step === "review" && "Confirm preview data, then run import."}
                  {step === "results" && "Download reports and retry failed rows if needed."}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {step === "upload" && (
                    <>
                      <Button variant="ghost" onClick={handleClose} disabled={uploading}>
                        Cancel
                      </Button>
                      <Button
                        onClick={() => setStep("mapping")}
                        disabled={!file || rows.length === 0}
                      >
                        Continue
                        <ArrowRight className="h-4 w-4" />
                      </Button>
                    </>
                  )}

                  {step === "mapping" && (
                    <>
                      <Button variant="ghost" onClick={moveBack}>
                        <ArrowLeft className="h-4 w-4" />
                        Back
                      </Button>
                      <Button onClick={moveNext} disabled={!importReady}>
                        Continue
                        <ArrowRight className="h-4 w-4" />
                      </Button>
                    </>
                  )}

                  {step === "review" && (
                    <>
                      <Button variant="ghost" onClick={moveBack} disabled={uploading}>
                        <ArrowLeft className="h-4 w-4" />
                        Back
                      </Button>
                      <Button onClick={handleImport} disabled={!importReady || uploading}>
                        {uploading ? "Importing..." : "Start import"}
                      </Button>
                    </>
                  )}

                  {step === "results" && (
                    <>
                      <Button variant="ghost" onClick={downloadFailureReport} disabled={!report || report.failed === 0}>
                        <Download className="h-4 w-4" />
                        Export failures
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={downloadSuccessReport}
                        disabled={!report || !report.successes || report.successes.length === 0}
                      >
                        <Download className="h-4 w-4" />
                        Export successes
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={resetWizard}
                        disabled={uploading}
                      >
                        New import
                      </Button>
                      <Button onClick={handleClose} disabled={uploading}>
                        Done
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </Card>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
