import { useCallback, useMemo, useState } from "react";
import { useDropzone } from "react-dropzone";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, CheckCircle2, Upload } from "lucide-react";

import { Button, Select, Card } from "@/components/ui";
import { ImportReport, importMembers } from "@/lib/api";
import { useToast } from "@/components/Toast";

type Props = {
  open: boolean;
  onClose: () => void;
  onComplete: (report: ImportReport) => void;
};

type CanonicalField = {
  key: string;
  label: string;
  required?: boolean;
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
  { key: "children", label: "Children (First|Last|Gender|DOB|Country|Notes;…)" },
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

type ParsedRow = Record<string, string>;

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
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    return { headers: [], rows: [] };
  }

  const headers = splitCsvLine(lines[0]);
  const rows = lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    const entry: ParsedRow = {};
    headers.forEach((header, index) => {
      entry[header] = cells[index] ?? "";
    });
    return entry;
  });

  return { headers, rows };
}

function buildCsv(rows: ParsedRow[], headers: string[]): string {
  const escape = (value: string) => {
    const string = value ?? "";
    if (/[",\n]/.test(string)) {
      return `"${string.replace(/"/g, '""')}"`;
    }
    return string;
  };

  const headerLine = headers.map(escape).join(",");
  const dataLines = rows.map((row) =>
    headers.map((header) => escape(row[header] ?? "")).join(",")
  );
  return [headerLine, ...dataLines].join("\n");
}

function inferMapping(headers: string[]) {
  return FIELDS.reduce<Record<string, string | "">>((acc, field) => {
    const aliases = HEADER_ALIASES[field.key] || [field.key];
    const match = headers.find((header) =>
      aliases.some((alias) => alias.toLowerCase() === header.toLowerCase())
    );
    acc[field.key] = match ?? "";
    return acc;
  }, {});
}

export default function ImportWizard({ open, onClose, onComplete }: Props) {
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [mapping, setMapping] = useState<Record<string, string | "">>(
    inferMapping([])
  );
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (!acceptedFiles.length) return;
    const candidate = acceptedFiles[0];
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
      setError(null);
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

  const requiredMissing = useMemo(
    () =>
      FIELDS.filter((field) => field.required && !mapping[field.key]).map(
        (field) => field.label
      ),
    [mapping]
  );

  const previewRows = useMemo(() => rows.slice(0, 5), [rows]);

  const handleSubmit = async () => {
    if (!file) {
      toast.push("Select a CSV before importing");
      return;
    }
    if (requiredMissing.length > 0) {
      toast.push("Map all required fields before importing");
      return;
    }
    setUploading(true);
    try {
      const canonical = FIELDS.map((field) => field.key);
      const normalized = rows.map((row) => {
        const entry: ParsedRow = {};
        FIELDS.forEach((field) => {
          const source = mapping[field.key];
          entry[field.key] = source ? row[source] ?? "" : "";
        });
        return entry;
      });
      const csvString = buildCsv(normalized, canonical);
      const outputFile = new File([csvString], file.name, { type: "text/csv" });
      const report = await importMembers(outputFile);
      onComplete(report);
      setFile(null);
      setHeaders([]);
      setRows([]);
    } catch (err) {
      console.error(err);
      toast.push("Import failed");
    } finally {
      setUploading(false);
    }
  };

  const heading = file ? file.name : "Drop your CSV here";

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 bg-ink/40 backdrop-blur-sm z-40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center px-4"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.18 }}
            role="dialog"
          >
            <Card className="w-full max-w-4xl p-6 space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold">Import members</h2>
                  <p className="text-sm text-mute">
                    Map your CSV columns to SaliteMihret fields before sending them to the API.
                  </p>
                  <p className="text-xs text-mute mt-1">
                    Tip: provide children as <code>First|Last|Gender|YYYY-MM-DD|Country|Notes</code>
                    entries separated by <code>;</code> (example: <code>Hanna|Mengistu|Female|2010-07-21|Ethiopia|Sunday school</code>).
                  </p>
                </div>
                <Button variant="ghost" onClick={onClose}>
                  Close
                </Button>
              </div>

              <div
                {...getRootProps()}
                className="border border-dashed border-border rounded-2xl p-6 flex flex-col items-center justify-center text-center bg-card/70 hover:border-accent/60 transition cursor-pointer"
              >
                <input {...getInputProps()} />
                <Upload className="h-10 w-10 text-accent mb-3" />
                <div className="text-sm font-medium">{heading}</div>
                <div className="text-xs text-mute mt-1">
                  {isDragActive
                    ? "Drop the CSV here…"
                    : "Drag & drop or browse for a CSV file (UTF-8, max 5MB)."}
                </div>
              </div>

              {error && (
                <div className="flex items-center gap-2 text-sm text-red-500">
                  <AlertTriangle className="h-4 w-4" />
                  {error}
                </div>
              )}

              {file && (
                <div className="grid gap-6 md:grid-cols-[2fr_3fr]">
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold flex items-center gap-2">
                      Field mapping
                      {requiredMissing.length === 0 && (
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      )}
                    </h3>
                    <div className="border border-border rounded-xl divide-y divide-border">
                      {FIELDS.map((field) => (
                        <div
                          key={field.key}
                          className="p-3 flex items-center justify-between gap-3"
                        >
                          <div>
                            <div className="text-sm font-medium">{field.label}</div>
                            {field.required && (
                              <div className="text-[11px] uppercase tracking-wide text-mute">
                                Required
                              </div>
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
                            className="w-44"
                          >
                            <option value="">Not mapped</option>
                            {headers.map((header) => (
                              <option key={header} value={header}>
                                {header}
                              </option>
                            ))}
                          </Select>
                        </div>
                      ))}
                    </div>
                    {requiredMissing.length > 0 && (
                      <div className="text-xs text-red-500">
                        Map required fields: {requiredMissing.join(", ")}
                      </div>
                    )}
                  </div>
                  <div className="space-y-3 overflow-hidden">
                    <h3 className="text-sm font-semibold">Preview (first 5 rows)</h3>
                    <div className="border border-border rounded-xl overflow-auto">
                      <table className="min-w-full text-xs">
                        <thead className="bg-card/80 text-mute uppercase tracking-wide">
                          <tr>
                            {FIELDS.filter((field) => mapping[field.key]).map((field) => (
                              <th key={field.key} className="px-3 py-2 text-left">
                                {field.label}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {previewRows.length === 0 && (
                            <tr>
                              <td
                                colSpan={FIELDS.length}
                                className="px-3 py-6 text-center text-mute"
                              >
                                This file has no rows yet.
                              </td>
                            </tr>
                          )}
                          {previewRows.map((row, index) => (
                            <tr key={index} className="border-t border-border/70">
                              {FIELDS.filter((field) => mapping[field.key]).map((field) => (
                                <td key={field.key} className="px-3 py-2">
                                  {row[mapping[field.key]!]}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex justify-between items-center">
                <div className="text-xs text-mute">
                  Supported headers: username, first_name, last_name, email, phone, gender,
                  status, district, address, birth_date, join_date, is_tither,
                  contribution_method, contribution_amount, notes, household, tags, ministries.
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" onClick={onClose}>
                    Cancel
                  </Button>
                  <Button onClick={handleSubmit} disabled={!file || uploading}>
                    {uploading ? "Importing…" : "Import"}
                  </Button>
                </div>
              </div>
            </Card>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
